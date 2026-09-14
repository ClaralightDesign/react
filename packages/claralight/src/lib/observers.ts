/**
 * One observer of each kind per document, and one animation frame in which
 * everything they saw is answered.
 *
 * ## Why this exists
 *
 * `Squircle` used to build its own pair per instance, and register the
 * `MutationObserver` on the shape *and on every one of its ancestors* — that
 * being the only way a single observer sees the `class` a theme toggle writes
 * on `<html>`. With N surfaces on a page that is N observers, N ancestor walks
 * at mount, and, when the toggle lands, N separate callbacks each running its
 * own write/read/write against the layout engine.
 *
 * One observer on `documentElement` with `subtree: true` sees all of the same
 * signals. Coalescing what it saw into a single animation frame, and running
 * that frame in phases, turns those N forced recalculations into one.
 *
 * ## What counts as a signal
 *
 * A surface has to resample when anything that could change its *computed*
 * style changes, which is three separate things and not only the element:
 *
 *   - any attribute on the element itself, because `[data-disabled]` and
 *     friends are how variants are selected;
 *   - `class` or `style` on any ancestor, because that is how the cascade
 *     carries a theme, a scope, or a hover state down to it;
 *   - the viewport size and the colour scheme, because a media query can
 *     restyle it without touching a single attribute.
 *
 * `observeAppearance` covers all three. Box size is separate — it changes the
 * shape without changing a style — and is `observeSize`.
 */

/**
 * A subscriber, split into the three things it does to the layout engine.
 *
 * Reading a computed style after writing one forces the engine to recalculate
 * on the spot, so a subscriber that writes, reads, then writes again costs one
 * synchronous recalculation — and N of them interleaved cost N. Taking the
 * phases separately lets the batch land every write, then take every read, then
 * land every write, which costs one recalculation no matter how many surfaces
 * are in the batch.
 *
 * `measure` must not write and `prepare` must not read. That split is the whole
 * reason this interface is not just a callback.
 */
export interface AppearanceListener {
  /** Writes only: put the element into the state that is about to be read. */
  prepare(): void;
  /** Reads only. */
  measure(): void;
  /** Writes, and whatever follows from what `measure` read. */
  commit(): void;
}

/** Outside a batch — at mount, or after a render that changed the inputs. */
export function syncNow(listener: AppearanceListener): void {
  listener.prepare();
  listener.measure();
  listener.commit();
}

/**
 * Written by the smooth-corner machinery onto the element it clips. Nothing in
 * ClaraLight's CSS selects on them, so a change is never a reason to resample.
 */
const IGNORED_ATTRIBUTES = new Set(["data-state", "data-slot"]);

/** The two attributes an ancestor can restyle a descendant through. */
const INHERITED_ATTRIBUTES = new Set(["class", "style"]);

/** `ownerDocument.defaultView`, which is the only window these ever touch. */
type View = Window & typeof globalThis;

interface Registry {
  appearance: Map<Element, Set<AppearanceListener>>;
  size: Map<Element, Set<AppearanceListener>>;
  /** Subscribers a signal named directly. */
  pending: Set<AppearanceListener>;
  /** `class`/`style` moved here; every subscriber beneath it is a subscriber. */
  branches: Set<Node>;
  /** A media query moved, which is every appearance subscriber at once. */
  everything: boolean;
  /** Whether the viewport and colour-scheme listeners are attached. */
  bound: boolean;
  /** Elements whose next attribute records are our own writes coming back. */
  settled: Set<Element>;
  mutation: MutationObserver | null;
  resize: ResizeObserver | null;
  scheme: MediaQueryList | null;
  onEnvironment: () => void;
  frame: number | null;
}

const registries = new WeakMap<View, Registry>();

function registryFor(view: View): Registry {
  const existing = registries.get(view);
  if (existing) return existing;
  const registry: Registry = {
    appearance: new Map(),
    size: new Map(),
    pending: new Set(),
    branches: new Set(),
    everything: false,
    bound: false,
    settled: new Set(),
    mutation: null,
    resize: null,
    scheme: null,
    onEnvironment: () => {
      registry.everything = true;
      schedule(view, registry);
    },
    frame: null,
  };
  registries.set(view, registry);
  return registry;
}

function schedule(view: View, registry: Registry) {
  if (registry.frame !== null) return;
  registry.frame = view.requestAnimationFrame(() => flush(registry));
}

function flush(registry: Registry) {
  registry.frame = null;
  const listeners = new Set(registry.pending);
  registry.pending.clear();
  const branches = [...registry.branches];
  registry.branches.clear();
  const everything = registry.everything;
  registry.everything = false;

  if (everything) {
    for (const set of registry.appearance.values()) {
      for (const listener of set) listeners.add(listener);
    }
  } else if (branches.length > 0) {
    // Walking down from the branch would mean knowing the subtree; asking each
    // subscriber whether it is under one is the same answer for a handful of
    // native calls, and it cannot go stale when an element is moved.
    for (const [element, set] of registry.appearance) {
      // Strictly beneath: a branch that *is* a subscriber was already offered
      // through the direct path, which is the only path `settle` can suppress.
      if (!branches.some((branch) => branch !== element && branch.contains(element))) continue;
      for (const listener of set) listeners.add(listener);
    }
  }

  if (listeners.size === 0) return;
  for (const listener of listeners) listener.prepare();
  for (const listener of listeners) listener.measure();
  for (const listener of listeners) listener.commit();
  // Everything the phases just wrote is our own doing, not a new signal. Only
  // records queued during this synchronous pass are dropped: anything that
  // arrived before it was already delivered into `pending` and `branches`.
  registry.mutation?.takeRecords();
}

function mutationObserverFor(view: View, registry: Registry): MutationObserver | null {
  if (registry.mutation) return registry.mutation;
  if (typeof view.MutationObserver !== "function") return null;
  const root = view.document?.documentElement;
  if (!root) return null;
  const observer = new view.MutationObserver((records) => {
    let signalled = false;
    for (const record of records) {
      const name = record.attributeName;
      if (name === null || IGNORED_ATTRIBUTES.has(name)) continue;
      const target = record.target;
      const direct = registry.appearance.get(target as Element);
      // A settled element's records are the writes a synchronous sync just
      // made, arriving one microtask later. Suppressing its own resample but
      // not the branch beneath it keeps a nested surface hearing a class change
      // that genuinely happened here.
      if (direct && !registry.settled.has(target as Element)) {
        for (const listener of direct) registry.pending.add(listener);
        signalled = true;
      }
      if (INHERITED_ATTRIBUTES.has(name)) {
        registry.branches.add(target);
        signalled = true;
      }
    }
    // One synchronous sync queues a record per property it wrote, and they all
    // arrive in this one delivery, so the mark is cleared per batch not per
    // record.
    registry.settled.clear();
    if (signalled) schedule(view, registry);
  });
  observer.observe(root, { attributes: true, subtree: true });
  registry.mutation = observer;
  return observer;
}

function resizeObserverFor(view: View, registry: Registry): ResizeObserver | null {
  if (registry.resize) return registry.resize;
  if (typeof view.ResizeObserver !== "function") return null;
  const observer = new view.ResizeObserver((entries) => {
    for (const entry of entries) {
      const listeners = registry.size.get(entry.target);
      if (!listeners) continue;
      for (const listener of listeners) registry.pending.add(listener);
    }
    schedule(view, registry);
  });
  registry.resize = observer;
  return observer;
}

function teardown(view: View, registry: Registry) {
  if (registry.appearance.size > 0 || registry.size.size > 0) return;
  registry.mutation?.disconnect();
  registry.mutation = null;
  registry.resize?.disconnect();
  registry.resize = null;
  view.removeEventListener("resize", registry.onEnvironment);
  registry.scheme?.removeEventListener?.("change", registry.onEnvironment);
  registry.scheme = null;
  registry.bound = false;
  if (registry.frame !== null) {
    view.cancelAnimationFrame(registry.frame);
    registry.frame = null;
  }
  registry.pending.clear();
  registry.branches.clear();
  registry.settled.clear();
  registry.everything = false;
  registries.delete(view);
}

function subscribe(
  map: Map<Element, Set<AppearanceListener>>,
  element: Element,
  listener: AppearanceListener,
) {
  const existing = map.get(element);
  if (existing) {
    existing.add(listener);
    return false;
  }
  map.set(element, new Set([listener]));
  return true;
}

function unsubscribe(
  map: Map<Element, Set<AppearanceListener>>,
  element: Element,
  listener: AppearanceListener,
) {
  const listeners = map.get(element);
  if (!listeners) return false;
  listeners.delete(listener);
  if (listeners.size > 0) return false;
  map.delete(element);
  return true;
}

/**
 * Resample `listener` whenever anything that could change `element`'s computed
 * style changes: an attribute on it, `class` or `style` on an ancestor, the
 * viewport, or the colour scheme.
 */
export function observeAppearance(element: Element, listener: AppearanceListener): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  const registry = registryFor(view);
  subscribe(registry.appearance, element, listener);
  mutationObserverFor(view, registry);
  // Bound once for the registry's whole life, not per subscriber: appearance
  // subscribers can drop to zero and come back while a size subscriber holds
  // the registry open, and re-binding there would strand the old query.
  if (!registry.bound) {
    registry.bound = true;
    view.addEventListener("resize", registry.onEnvironment);
    registry.scheme = view.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    registry.scheme?.addEventListener?.("change", registry.onEnvironment);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unsubscribe(registry.appearance, element, listener);
    registry.pending.delete(listener);
    registry.settled.delete(element);
    teardown(view, registry);
  };
}

/** Resample `listener` whenever `element`'s box changes size. */
export function observeSize(element: Element, listener: AppearanceListener): () => void {
  const view = element.ownerDocument.defaultView;
  if (!view) return () => {};
  const registry = registryFor(view);
  const observer = resizeObserverFor(view, registry);
  if (!observer) return () => {};
  if (subscribe(registry.size, element, listener)) observer.observe(element);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (unsubscribe(registry.size, element, listener)) observer.unobserve(element);
    registry.pending.delete(listener);
    teardown(view, registry);
  };
}

/**
 * Put `listener` into the next batch without an observer having seen anything —
 * for the signals that arrive as events rather than as mutations.
 */
export function requestSync(element: Element, listener: AppearanceListener): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const registry = registries.get(view);
  if (!registry) return;
  registry.pending.add(listener);
  schedule(view, registry);
}

/**
 * Tell the shared observer that the attribute records `element` is about to
 * queue are ours. Used by a synchronous sync, which cannot drain the shared
 * observer's queue the way a batch can without swallowing other subscribers'
 * signals.
 */
export function settle(element: Element): void {
  const view = element.ownerDocument.defaultView;
  if (!view) return;
  const registry = registries.get(view);
  if (registry?.appearance.has(element)) registry.settled.add(element);
}
