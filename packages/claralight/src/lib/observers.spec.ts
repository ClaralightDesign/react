import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AppearanceListener,
  observeAppearance,
  observeSize,
  requestSync,
  settle,
} from "./observers";

/**
 * The module only ever reaches the platform through `ownerDocument.defaultView`,
 * so a window with the four constructors on it is the whole surface to fake.
 * What the tests are actually about is the dispatch and the phase order, and
 * both are engine-independent.
 */

interface FakeRecord {
  type: "attributes";
  attributeName: string;
  target: FakeElement;
}

class FakeElement {
  parent: FakeElement | null = null;
  constructor(readonly ownerDocument: { defaultView: FakeView }) {}

  child() {
    const node = new FakeElement(this.ownerDocument);
    node.parent = this;
    return node;
  }

  contains(other: FakeElement): boolean {
    for (let node: FakeElement | null = other; node; node = node.parent) {
      if (node === this) return true;
    }
    return false;
  }
}

class FakeView {
  mutations: { callback: (records: FakeRecord[]) => void; disconnected: boolean }[] = [];
  resizes: {
    callback: (entries: { target: FakeElement }[]) => void;
    observed: Set<FakeElement>;
    disconnected: boolean;
  }[] = [];
  frames = new Map<number, () => void>();
  events = new Map<string, Set<() => void>>();
  media = new Map<string, Set<() => void>>();
  private nextFrame = 1;
  document: { documentElement: FakeElement };

  constructor() {
    this.document = { documentElement: new FakeElement({ defaultView: this }) };
    const view = this;

    this.MutationObserver = class {
      private readonly entry;
      constructor(callback: (records: FakeRecord[]) => void) {
        this.entry = { callback, disconnected: false };
        view.mutations.push(this.entry);
      }
      observe() {}
      takeRecords() {
        return [];
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    };

    this.ResizeObserver = class {
      private readonly entry;
      constructor(callback: (entries: { target: FakeElement }[]) => void) {
        this.entry = { callback, observed: new Set<FakeElement>(), disconnected: false };
        view.resizes.push(this.entry);
      }
      observe(element: FakeElement) {
        this.entry.observed.add(element);
      }
      unobserve(element: FakeElement) {
        this.entry.observed.delete(element);
      }
      disconnect() {
        this.entry.disconnected = true;
      }
    };
  }

  MutationObserver: new (
    callback: (records: FakeRecord[]) => void,
  ) => unknown;
  ResizeObserver: new (
    callback: (entries: { target: FakeElement }[]) => void,
  ) => unknown;

  requestAnimationFrame(callback: () => void) {
    const id = this.nextFrame++;
    this.frames.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number) {
    this.frames.delete(id);
  }

  addEventListener(type: string, listener: () => void) {
    const set = this.events.get(type) ?? new Set();
    set.add(listener);
    this.events.set(type, set);
  }

  removeEventListener(type: string, listener: () => void) {
    this.events.get(type)?.delete(listener);
  }

  matchMedia(query: string) {
    const listeners = this.media.get(query) ?? new Set<() => void>();
    this.media.set(query, listeners);
    return {
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    };
  }

  /** Deliver one batch of attribute records, the way a real observer would. */
  mutate(...records: FakeRecord[]) {
    for (const entry of this.mutations) {
      if (!entry.disconnected) entry.callback(records);
    }
  }

  resize(...targets: FakeElement[]) {
    for (const entry of this.resizes) {
      if (entry.disconnected) continue;
      entry.callback(
        targets.filter((target) => entry.observed.has(target)).map((target) => ({ target })),
      );
    }
  }

  /** Run whatever is scheduled, and only that: a flush may schedule again. */
  flush() {
    const pending = [...this.frames.values()];
    this.frames.clear();
    for (const frame of pending) frame();
    return pending.length;
  }

  fire(type: string) {
    for (const listener of this.events.get(type) ?? []) listener();
  }

  fireMedia(query: string) {
    for (const listener of this.media.get(query) ?? []) listener();
  }
}

const attribute = (target: FakeElement, attributeName: string): FakeRecord => ({
  type: "attributes",
  attributeName,
  target,
});

let view: FakeView;
let root: FakeElement;

beforeEach(() => {
  view = new FakeView();
  root = view.document.documentElement;
});

/** Records which phase ran when, across every listener in a batch. */
function tracker() {
  const order: string[] = [];
  const listener = (name: string): AppearanceListener => ({
    prepare: () => void order.push(`${name}:prepare`),
    measure: () => void order.push(`${name}:measure`),
    commit: () => void order.push(`${name}:commit`),
    release: () => void order.push(`${name}:release`),
  });
  return { order, listener };
}

const observe = (element: FakeElement, listener: AppearanceListener) =>
  observeAppearance(element as unknown as Element, listener);
const observeBox = (element: FakeElement, listener: AppearanceListener) =>
  observeSize(element as unknown as Element, listener);

describe("shared observers", () => {
  it("builds one observer of each kind however many surfaces subscribe", () => {
    const { listener } = tracker();
    const elements = [root.child(), root.child(), root.child()];
    for (const element of elements) {
      observe(element, listener("a"));
      observeBox(element, listener("a"));
    }
    expect(view.mutations).toHaveLength(1);
    expect(view.resizes).toHaveLength(1);
    expect(view.resizes[0]?.observed.size).toBe(3);
  });

  it("runs every prepare, then every measure, then every commit, then every release", () => {
    const { order, listener } = tracker();
    const scope = root.child();
    observe(scope.child(), listener("a"));
    observe(scope.child(), listener("b"));

    view.mutate(attribute(scope, "class"));
    view.flush();

    expect(order).toEqual([
      "a:prepare",
      "b:prepare",
      "a:measure",
      "b:measure",
      "a:commit",
      "b:commit",
      "a:release",
      "b:release",
    ]);
  });

  it("leaves the release phase out when a subscriber does not need it", () => {
    const { order, listener } = tracker();
    const a = root.child();
    const b = root.child();
    const { release: _release, ...withoutRelease } = listener("a");
    observe(a, withoutRelease);
    observe(b, listener("b"));

    view.mutate(attribute(root, "class"));
    view.flush();

    expect(order).toEqual([
      "a:prepare",
      "b:prepare",
      "a:measure",
      "b:measure",
      "a:commit",
      "b:commit",
      "b:release",
    ]);
  });

  it("answers a batch of signals in a single frame", () => {
    const { order, listener } = tracker();
    const scope = root.child();
    const element = scope.child();
    observe(element, listener("a"));

    view.mutate(attribute(scope, "class"), attribute(element, "data-disabled"));
    view.mutate(attribute(root, "class"));
    expect(order).toEqual([]);
    expect(view.flush()).toBe(1);

    expect(order).toEqual(["a:prepare", "a:measure", "a:commit", "a:release"]);
  });

  it("carries an ancestor's class down to nested surfaces", () => {
    const { order, listener } = tracker();
    const outer = root.child();
    const inner = outer.child();
    observe(outer, listener("outer"));
    observe(inner, listener("inner"));

    view.mutate(attribute(outer, "class"));
    view.flush();

    expect(order.filter((step) => step.endsWith(":measure"))).toEqual([
      "outer:measure",
      "inner:measure",
    ]);
  });

  it("only resamples the element an unrelated attribute belongs to", () => {
    const { order, listener } = tracker();
    const a = root.child();
    const b = root.child();
    observe(a, listener("a"));
    observe(b, listener("b"));

    view.mutate(attribute(a, "data-disabled"));
    view.flush();

    expect(order).toEqual(["a:prepare", "a:measure", "a:commit", "a:release"]);
  });

  it("ignores an ancestor attribute that cannot reach the cascade", () => {
    const { order, listener } = tracker();
    const scope = root.child();
    observe(scope.child(), listener("a"));

    view.mutate(attribute(scope, "data-side"));
    view.flush();

    expect(order).toEqual([]);
  });

  it("ignores the attributes the corner machinery writes on the shape", () => {
    const { order, listener } = tracker();
    const element = root.child();
    observe(element, listener("a"));

    view.mutate(attribute(element, "data-state"), attribute(element, "data-slot"));
    view.flush();

    expect(order).toEqual([]);
  });

  it("treats a settled element's own records as its own writes, once", () => {
    const { order, listener } = tracker();
    const element = root.child();
    observe(element, listener("a"));

    settle(element as unknown as Element);
    // One synchronous sync writes several properties, so several records land
    // together — the mark has to cover the whole delivery.
    view.mutate(attribute(element, "style"), attribute(element, "style"));
    view.flush();
    expect(order).toEqual([]);

    view.mutate(attribute(element, "style"));
    view.flush();
    expect(order).toEqual(["a:prepare", "a:measure", "a:commit", "a:release"]);
  });

  it("still carries a settled element's class down to what is nested in it", () => {
    const { order, listener } = tracker();
    const outer = root.child();
    const inner = outer.child();
    observe(outer, listener("outer"));
    observe(inner, listener("inner"));

    settle(outer as unknown as Element);
    view.mutate(attribute(outer, "class"));
    view.flush();

    expect(order).toEqual(["inner:prepare", "inner:measure", "inner:commit", "inner:release"]);
  });

  it("resamples every surface when the viewport or the colour scheme moves", () => {
    const { order, listener } = tracker();
    observe(root.child(), listener("a"));
    observe(root.child(), listener("b"));

    view.fire("resize");
    view.flush();
    expect(order.filter((step) => step.endsWith(":measure"))).toEqual(["a:measure", "b:measure"]);

    order.length = 0;
    view.fireMedia("(prefers-color-scheme: dark)");
    view.flush();
    expect(order.filter((step) => step.endsWith(":measure"))).toEqual(["a:measure", "b:measure"]);
  });

  it("reports a size change to the surface whose box moved", () => {
    const { order, listener } = tracker();
    const a = root.child();
    const b = root.child();
    observeBox(a, listener("a"));
    observeBox(b, listener("b"));

    view.resize(a);
    view.flush();

    expect(order).toEqual(["a:prepare", "a:measure", "a:commit", "a:release"]);
  });

  it("puts an event-driven resample into the same batch", () => {
    const { order, listener } = tracker();
    const a = root.child();
    const b = root.child();
    const first = listener("a");
    observe(a, first);
    observe(b, listener("b"));

    // A pointer crossing from one surface to the other, in one tick.
    requestSync(a as unknown as Element, first);
    view.mutate(attribute(b, "data-hover"));
    expect(view.flush()).toBe(1);

    expect(order).toEqual([
      "a:prepare",
      "b:prepare",
      "a:measure",
      "b:measure",
      "a:commit",
      "b:commit",
      "a:release",
      "b:release",
    ]);
  });

  it("never resamples a surface after it has unsubscribed", () => {
    const { order, listener } = tracker();
    const element = root.child();
    const release = observe(element, listener("a"));

    view.mutate(attribute(element, "class"));
    release();
    view.flush();

    expect(order).toEqual([]);
  });

  it("tears the observers and the window listeners down with the last surface", () => {
    const { listener } = tracker();
    const element = root.child();
    const a = listener("a");
    const releaseAppearance = observe(element, a);
    const releaseSize = observeBox(element, a);
    expect(view.events.get("resize")?.size).toBe(1);
    expect(view.media.get("(prefers-color-scheme: dark)")?.size).toBe(1);

    releaseAppearance();
    expect(view.mutations[0]?.disconnected).toBe(false);

    releaseSize();
    expect(view.mutations[0]?.disconnected).toBe(true);
    expect(view.resizes[0]?.disconnected).toBe(true);
    expect(view.events.get("resize")?.size).toBe(0);
    expect(view.media.get("(prefers-color-scheme: dark)")?.size).toBe(0);
    expect(view.frames.size).toBe(0);
  });

  it("binds the viewport listeners once across an appearance gap", () => {
    const { listener } = tracker();
    const element = root.child();
    const a = listener("a");
    observeBox(element, a);
    const release = observe(element, a);
    release();
    observe(element, a);

    expect(view.events.get("resize")?.size).toBe(1);
    expect(view.media.get("(prefers-color-scheme: dark)")?.size).toBe(1);
  });

  it("is safe to release twice", () => {
    const { listener } = tracker();
    const element = root.child();
    const release = observe(element, listener("a"));
    release();
    expect(release).not.toThrow();
  });

  it("keeps documents apart", () => {
    const { order, listener } = tracker();
    const other = new FakeView();
    observe(root.child(), listener("a"));
    observe(other.document.documentElement.child(), listener("b"));

    view.mutate(attribute(root, "class"));
    view.flush();

    expect(order).toEqual(["a:prepare", "a:measure", "a:commit", "a:release"]);
    expect(view.mutations).toHaveLength(1);
    expect(other.mutations).toHaveLength(1);
  });
});

describe("shared observers without platform support", () => {
  it("subscribes to nothing rather than throwing when ResizeObserver is missing", () => {
    const bare = new FakeView();
    // @ts-expect-error deliberately removing the constructor the module guards for
    bare.ResizeObserver = undefined;
    const element = bare.document.documentElement.child();
    const release = observeBox(element, { prepare: vi.fn(), measure: vi.fn(), commit: vi.fn() });
    expect(bare.resizes).toHaveLength(0);
    expect(release).not.toThrow();
  });
});
