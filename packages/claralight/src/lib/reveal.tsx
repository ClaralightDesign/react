"use client";

import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { tokenNumber } from "@/lib/utils";

/**
 * The ClaraLight surface **reveal** — the select panel's entrance.
 *
 * A sibling of `useSurfaceMorph`, and deliberately not the same animation. Both
 * carry a floating layer out of the rectangle that opened it; they disagree
 * about what happens to what is inside it, and that disagreement is the whole
 * reason this file exists.
 *
 * ## Clip, not stretch
 *
 * `useSurfaceMorph` writes a projective `matrix3d` onto the wrapper. Everything
 * under it is transformed — which is right for a dialog, where the four corners
 * travelling on different curves is the effect, and the title going with them
 * reads as a surface turning in space.
 *
 * A menu cannot do that. Its rows are a list of labels the eye is already
 * reading; squashing them to a third of their height and letting them spring
 * back is a distortion of *content*, not of a surface. So the panel is laid out
 * at its final size for the whole journey and only the **box around it** moves:
 * the content is centred in that box and clipped by it, appearing as the box
 * uncovers it rather than growing with it. Flutter draws the same frame through
 * a `Flow` whose delegate hands the list `BoxConstraints.tight(targetSize)` and
 * centres it inside the animating parent; this is that, in the DOM.
 *
 * ## Why the box is the shape, and the size is real
 *
 * The clipped element's size is animated for real — inline `width`/`height` —
 * rather than the clip being animated under a static box. That looks like the
 * expensive choice and is the cheap one, because of who owns the corners.
 *
 * Lisse draws a ClaraLight corner as a generated `clip-path`, and paints the 1px
 * outline and the shadow as SVG overlays that are *siblings* of the clipped
 * element. All three are functions of the box's measured size. Animating the
 * clip alone would leave the outline and the shadow at the resting size, which
 * is the same class of bug `.cl-enter-root` exists to avoid — and Lisse offers
 * no way to drive its overlays directly.
 *
 * Resizing the box instead puts all three back under one owner. Lisse observes
 * the element, and its scheduler re-measures inside a `requestAnimationFrame`
 * rather than trusting the `ResizeObserver` entry — so a size written from this
 * file's frame callback is picked up by Lisse's callback **in the same frame**,
 * and the fill, the outline and the shadow are never a frame apart. Registration
 * order is what guarantees it: Lisse's frame is scheduled from the observer
 * delivery that follows our write, so it is always queued behind us.
 *
 * ## Where each inline style goes
 *
 *   wrapper   pinned to its resting size, so the box changing underneath it is
 *             invisible to whatever positioned it — Base UI re-solves a
 *             positioner whose floating element resizes, and would spend the
 *             entrance fighting this one.
 *   shape     absolutely positioned inside that wrapper; `left`/`top`/`width`/
 *             `height` are the animated rectangle. Lisse offsets its overlays by
 *             the shape's `offsetLeft`/`offsetTop`, so they follow it.
 *   content   pinned to its resting size and centred, which is what makes the
 *             reveal a clip.
 *
 * ## The curve
 *
 * `--cl-spring-select-*` — the Flutter select's own spring, which overshoots
 * about 11%. It drives the box's **centre** and nothing else: the size is eased
 * and never passes its resting value, on a shorter clock, so the panel is at its
 * final size while it is still sliding the last of the way in. `revealRect` has
 * the argument for why those two cannot share one progress.
 *
 * The dismissal springs neither, because a box that undershoots collapses
 * *through* its trigger and out the other side. So the two legs run different
 * curves, which is also what Flutter does (`_openTravelSpring` against
 * `_closeTravelSpring`).
 *
 * Reduced motion never runs this file. The layer keeps the opacity leg from
 * `base.css` and none of the geometry, which is what the setting is asking for.
 */

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Six decimals is past the point a sub-pixel layout is distinguishable. */
const round = (value: number) => Number(value.toFixed(6));

const lerp = (from: number, to: number, at: number) => from + (to - from) * at;

/**
 * The share of the journey the content fades over, and the curve it fades on.
 *
 * Kept identical to `useSurfaceMorph`'s: the reveal is a second way of drawing
 * the same entrance, so the layer must not become legible at a different point
 * of it depending on which one drew it.
 */
const REVEAL = 0.35;

/** Read from the geometry's own progress, so the two legs cannot disagree. */
const easeOut = (at: number) => 1 - (1 - at) ** 3;

/** The size's curve on the way in: Flutter's `Curves.easeInOutCubic`. */
const easeInOut = (at: number) => (at < 0.5 ? 4 * at * at * at : 1 - (-2 * at + 2) ** 3 / 2);

/**
 * The share of the leg the size takes, against the spring's full ring-out.
 *
 * Flutter gives the size 240ms while the travel spring settles over rather
 * longer; the ratio is what matters, not the milliseconds, because both are
 * expressed here against `--cl-duration-morph`. The panel therefore reaches its
 * final size while it is still sliding the last of the way into place.
 */
const MORPH_SHARE = 240 / 380;

export interface RevealRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The closed-form position of an underdamped second-order system.
 *
 * The same solution `scripts/gen-spring.mjs` samples into the `linear()` easing
 * tokens, evaluated here instead because this leg is driven per frame — a CSS
 * timing function cannot be read back, and the box's size has to be known to
 * regenerate the corner path at it.
 */
export function springProgress(at: number, omega: number, zeta: number): number {
  if (at <= 0) return 0;
  if (at >= 1) return 1;
  if (zeta >= 1) return 1 - Math.exp(-omega * at) * (1 + omega * at);
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return (
    1 -
    Math.exp(-zeta * omega * at) *
      (Math.cos(damped * at) + ((zeta * omega) / damped) * Math.sin(damped * at))
  );
}

/**
 * The rectangle the box occupies, in the wrapper's coordinates.
 *
 * Centre and size are interpolated separately — not the four corners — because
 * the box must stay a rectangle: it is the thing doing the clipping, and a
 * trapezoid would put the rows back into a perspective they are not in.
 *
 * They also run on **two different clocks**, which is the part that is easy to
 * collapse into one and wrong to:
 *
 *   travel  the centre, on the spring. Overshoots, and is deliberately not
 *           clamped — the panel slides a little past where it belongs and
 *           settles back, which is the whole reason there is a spring.
 *   morph   the size, eased and never past 1. A panel is only ever as large as
 *           it is going to be.
 *
 * Springing the size as well looks identical on a short panel and is plainly
 * broken on a tall one: a 320px list opened near the top of the viewport grows
 * 11% about its own centre and puts its first rows off-screen for the length of
 * the settle. Flutter splits the same two — `_travel` is a `SpringSimulation`,
 * `_morph` is an `easeInOutCubic` over its own shorter duration.
 */
export function revealRect(
  box: RevealRect,
  source: RevealRect | null,
  travel: number,
  morph: number,
): RevealRect {
  if (!source) return { x: 0, y: 0, width: box.width, height: box.height };
  const width = lerp(source.width, box.width, morph);
  const height = lerp(source.height, box.height, morph);
  const centerX = lerp(source.x + source.width / 2, box.x + box.width / 2, travel);
  const centerY = lerp(source.y + source.height / 2, box.y + box.height / 2, travel);
  return {
    x: centerX - width / 2 - box.x,
    y: centerY - height / 2 - box.y,
    width,
    height,
  };
}

/* ---------------------------------------------------------------------------
 * The layer
 * ------------------------------------------------------------------------- */

export interface SurfaceRevealOptions {
  /** Pinned to its resting size; what positioned the layer measures. */
  wrapper: HTMLElement | null;
  /** The clipped element, whose rectangle is the animation. */
  shape: HTMLElement | null;
  /** Laid out at its resting size and centred in the shape for the whole leg. */
  content: HTMLElement | null;
  /** Resolved at the start of every leg, so a trigger that moved is followed. */
  anchor?: RefObject<HTMLElement | null> | null;
  /** Whether the layer is open. */
  open: boolean;
}

interface Geometry {
  /** The wrapper's resting box, in viewport coordinates. */
  box: RevealRect;
  /** The rectangle it grows out of, in viewport coordinates. */
  source: RevealRect | null;
  /** The content's resting size, which it is held at for the whole leg. */
  content: { width: number; height: number };
}

interface Runtime {
  view: Window | null;
  wrapper: HTMLElement | null;
  shape: HTMLElement | null;
  content: HTMLElement | null;
  anchor: RefObject<HTMLElement | null> | null;
  /** The centre's progress: 0 at the trigger, 1 at rest, above 1 overshooting. */
  progress: number;
  /** The size's progress, on its own shorter clock and never past 1. */
  morph: number;
  /** Where each was when the current leg began, so a reversal is continuous. */
  from: number;
  fromMorph: number;
  target: 0 | 1;
  geometry: Geometry | null;
  frame: number;
  started: number;
  duration: number;
  enter: number;
  exit: number;
  omega: number;
  zeta: number;
  /** The exit sentinel's animation: the clock Base UI unmounts on. */
  clock: Animation | null;
  sentinel: HTMLElement | null;
}

const rectOf = (rect: DOMRect): RevealRect => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});

function readSource(anchor: RefObject<HTMLElement | null> | null): RevealRect | null {
  const element = anchor?.current;
  return element?.isConnected ? rectOf(element.getBoundingClientRect()) : null;
}

/**
 * The exit sentinel, or `null` when the layer has none.
 *
 * Looked up rather than assumed: the class is `base.css`'s contract for the
 * non-visual animation Base UI can await while the wrapper moves.
 */
function exitSentinel(element: HTMLElement): HTMLElement | null {
  return element.querySelector(".cl-exit-sentinel");
}

/** Every inline property this file writes, in one place so release is total. */
function release(state: Runtime): void {
  for (const property of ["width", "height", "opacity", "translate"]) {
    state.wrapper?.style.removeProperty(property);
  }
  state.shape?.style.removeProperty("pointer-events");
  for (const property of ["position", "left", "top", "width", "height", "opacity"]) {
    state.shape?.style.removeProperty(property);
    state.content?.style.removeProperty(property);
  }
  state.content?.style.removeProperty("max-height");
  state.content?.style.removeProperty("translate");
}

/**
 * Both boxes at rest, measured with this file's own inline geometry lifted.
 *
 * The resting box is the only honest measurement of where the layer belongs, and
 * an animated rectangle cannot be subtracted back out of it. Nothing runs in
 * between, so the browser never paints the lifted frame.
 */
/**
 * The leg's durations and spring, off the layer's own cascade.
 *
 * Taken wherever the leg's geometry is, and deliberately **not** in the layout
 * effect of an opening leg. `getComputedStyle` forces a style flush, and doing
 * that while Base UI is still resolving the positioner changes what Base UI goes
 * on to measure: on a panel tall enough to be a near thing, it flipped the
 * `alignItemWithTrigger` decision from "not enough room, open below" to "overlap
 * the trigger" and then placed the overlap against a half-resolved layout. The
 * panel landed 130px off its trigger, and nothing in this file had written a
 * single pixel of geometry yet — only read one.
 *
 * Nothing here needs to be early. The durations cannot have changed since the
 * last leg in a way that matters before the first frame, and the first frame is
 * where this leg's geometry is decided anyway.
 */
function readTokens(state: Runtime): void {
  const { wrapper, view } = state;
  if (!wrapper || !view) return;
  const computed = view.getComputedStyle(wrapper);
  const read = (name: string, fallback: number) =>
    tokenNumber(computed.getPropertyValue(name)) ?? fallback;
  state.enter = read("--cl-duration-morph", state.enter);
  state.exit = read("--cl-duration-surface", state.exit);
  state.omega = read("--cl-spring-select-omega", state.omega);
  state.zeta = read("--cl-spring-select-zeta", state.zeta);
}

function measure(state: Runtime): Geometry | null {
  const { wrapper, content } = state;
  if (!wrapper || !content) return null;
  release(state);
  return {
    box: rectOf(wrapper.getBoundingClientRect()),
    source: readSource(state.anchor),
    content: {
      width: content.getBoundingClientRect().width,
      height: content.getBoundingClientRect().height,
    },
  };
}

/**
 * Hold both boxes at their resting size for the duration of the leg.
 *
 * Written once per leg rather than per frame: neither value changes while the
 * box travels, and re-asserting them would be more style invalidations in a
 * frame that already has the ones that matter.
 *
 * Nothing here changes how anything is *positioned*. That is deliberate and was
 * not the first design: absolutely positioning the clipped element inside the
 * wrapper is the obvious way to fly a box around inside a fixed one, and it
 * silently costs the panel its opening focus. Base UI moves focus to the
 * selected item when the panel opens, having first scrolled it under the
 * trigger, and that scroll is computed against the popup's offset parent — which
 * `position: absolute` changes. The panel still opened and still took the
 * keyboard, so nothing looked broken; it just opened with nothing highlighted,
 * and the first arrow key went on re-establishing what should already have been
 * there. So the shape stays exactly where Base UI's layout puts it, and the
 * travel is a `translate` on the wrapper instead — which no layout reads.
 */
function pin(state: Runtime): void {
  const { wrapper, shape, content, geometry } = state;
  if (!wrapper || !shape || !content || !geometry) return;
  // A travelling box slides out from under a cursor that has not moved, and the
  // row it leaves behind gets a `pointerleave` it did not earn. Base UI reads
  // that as the pointer leaving the item, hands focus back to the popup and drops
  // the highlight it had just put on the selected row — so the panel opens, takes
  // the keyboard, and has nothing highlighted, which costs the first arrow key.
  // Nothing under a moving box should be answering the pointer at all; the leg is
  // short, and the panel takes the pointer back the moment it stops.
  shape.style.pointerEvents = "none";
  wrapper.style.width = `${round(geometry.box.width)}px`;
  wrapper.style.height = `${round(geometry.box.height)}px`;
  content.style.width = `${round(geometry.content.width)}px`;
  content.style.height = `${round(geometry.content.height)}px`;
  // And held against its own `max-height`, which is written in terms of Base UI's
  // `--available-height` — a live measurement that is still settling while the
  // panel opens. Left to it, the list is clamped to the space the *trigger* had
  // for the first frames of the leg and grows with the box after all, which is
  // the one thing the pin exists to prevent. The resting height already respects
  // the cap, so asserting it here changes nothing at rest.
  content.style.maxHeight = `${round(geometry.content.height)}px`;
}

/**
 * One frame: the box's size on the shape, its position on the wrapper.
 *
 * Split that way because the two have different audiences. The size has to be
 * real — Lisse regenerates the corner path and the SVG overlays from the
 * element's measured box, and nothing else can tell it to. The position must not
 * be: the shape sits where Base UI's layout put it, and `translate` moves the
 * wrapper and everything Lisse hung on it as one object without any of it
 * becoming a layout anyone can read.
 */
function paint(state: Runtime): void {
  const { wrapper, shape, content, geometry } = state;
  if (!wrapper || !shape || !content || !geometry) return;
  const rect = revealRect(geometry.box, geometry.source, state.progress, state.morph);
  shape.style.width = `${round(Math.max(0, rect.width))}px`;
  shape.style.height = `${round(Math.max(0, rect.height))}px`;
  wrapper.style.translate = `${round(rect.x)}px ${round(rect.y)}px`;
  // Read off the size rather than the travel: the content is revealed by the box
  // uncovering it, so it must not still be fading while the box has stopped
  // growing — nor be fully legible inside a box a third of its height.
  const revealed = Math.min(1, Math.max(0, state.morph / REVEAL));
  content.style.opacity = String(round(easeOut(revealed)));
}

function stop(state: Runtime): void {
  cancel(state);
  state.clock = null;
  state.sentinel = null;
}

/** Drop a pending frame without forgetting which clock the leg is on. */
function cancel(state: Runtime): void {
  if (state.frame && state.view) state.view.cancelAnimationFrame(state.frame);
  state.frame = 0;
}

/**
 * How far through its leg the layer is, in [0, 1].
 *
 * A dismissal runs on Base UI's own clock — the exit sentinel's animation, whose
 * end is the frame the layer is unmounted on — so that the collapse lands on the
 * trigger exactly as the layer is removed, however the frames fall.
 *
 * Borrowing that clock means handling its whole life, not just the part where it
 * is running. `getComputedTiming().progress` is `null` in **two** states, and
 * they are opposite ends of the leg: the before phase, which is this leg's first
 * frame because Base UI creates the animation when the state lands and starts it
 * on the frame after; and the finished phase, once Base UI has torn the
 * animation down. Reading both as zero is what a frame budget cannot absorb — the
 * leg restarts from its beginning every frame, the loop never reaches its end,
 * and the next entrance opens from a layer that never left. So the two are told
 * apart by `playState`, and the wall clock is the backstop underneath: a leg that
 * outlives a reasonable multiple of its own duration is over whatever any
 * animation says, which is also what keeps a torn-down clock from pinning a
 * `requestAnimationFrame` loop open for the life of the page.
 */
function progressOf(state: Runtime, view: Window): number {
  const overdue = (view.performance.now() - state.started) / state.duration;
  if (!state.clock) return overdue;
  if (state.clock.playState === "finished" || state.clock.playState === "idle") return 1;
  return state.clock.effect?.getComputedTiming().progress ?? (overdue > 1 ? 1 : 0);
}

function step(state: Runtime): void {
  state.frame = 0;
  const view = state.view;
  if (!view) return;

  // The deferred first measurement. `start` could not take it: the layout effect
  // that calls it runs before Base UI's positioner has resolved `--anchor-width`,
  // and the wrapper's `min-width` is written in terms of it — so a box measured
  // there is the list's own natural width rather than the trigger's, and the
  // panel lands on the wrong size and snaps when the leg releases it. Everything
  // here happens inside one frame callback, before the browser paints, so the
  // frame the layer spent hidden is a frame nobody sees.
  if (!state.geometry) {
    readTokens(state);
    state.geometry = measure(state);
    state.started = view.performance.now();
    if (!state.geometry?.source) {
      release(state);
      return;
    }
    pin(state);
  }

  state.clock ??= state.sentinel?.getAnimations()[0] ?? null;
  const ratio = Math.min(1, Math.max(0, progressOf(state, view)));
  // The entrance is allowed past its resting rectangle and settles back onto it;
  // the dismissal is not, because a box that undershoots collapses through its
  // trigger and out the other side. The size never overshoots either way.
  const entering = state.target === 1;
  const travelled = entering ? springProgress(ratio, state.omega, state.zeta) : easeOut(ratio);
  const morphed = entering ? easeInOut(Math.min(1, ratio / MORPH_SHARE)) : easeOut(ratio);
  state.progress = lerp(state.from, state.target, travelled);
  state.morph = lerp(state.fromMorph, state.target, morphed);
  paint(state);
  if (ratio < 1) {
    state.frame = view.requestAnimationFrame(() => step(state));
    return;
  }
  state.progress = state.target;
  state.morph = state.target;
  state.clock = null;
  state.sentinel = null;
  // At rest the box is exactly the wrapper, so the inline geometry can go and
  // the layer goes back to being laid out by its own CSS. A dismissal keeps it:
  // the frame it reached is the frame Base UI unmounts on, and snapping back to
  // full size for it would be a flash.
  if (state.target === 1) release(state);
  else paint(state);
}

/**
 * Begin a leg towards `target`, from wherever the layer actually is.
 *
 * The duration is the leg's own token scaled by the distance left, so a layer
 * caught mid-flight reverses quickly instead of replaying a full entrance
 * backwards.
 */
function start(state: Runtime, target: 0 | 1): void {
  const { wrapper, shape, view } = state;
  if (!wrapper || !shape || !view) return;

  if (state.frame) {
    // A leg already in flight: the box has not moved, but the trigger may have.
    if (state.geometry) state.geometry = { ...state.geometry, source: readSource(state.anchor) };
  } else {
    if (target === 1) {
      // Every entrance measures afresh, and none of them can measure here: this
      // runs in the layout effect of the commit that mounted or unhid the panel,
      // before the positioner has resolved `--anchor-width` — and the wrapper's
      // `min-width` is written in terms of it, so the box read here is the list's
      // own natural width rather than the trigger's. `step` takes the reading one
      // frame later instead, and the layer is hidden until it: an entrance has no
      // frame worth showing before it knows where it is going.
      //
      // The release, though, has to happen *here*, and it is the whole reason
      // this branch is not just `state.geometry = null`. A dismissal leaves its
      // last frame's geometry on the elements on purpose — that frame is the one
      // Base UI unmounts on — so the panel comes back to this leg still pinned to
      // the collapsed box and still translated onto its trigger. Base UI resolves
      // the positioner before the frame `step` gets, and an `alignItemWithTrigger`
      // placement measures the floating element to decide how far to overlap: it
      // would be measuring the *previous* dismissal. That error is not one-off,
      // because each placement is the input to the next one — measured, the panel
      // climbed 3.5px per open-and-close and never came back down.
      release(state);
      state.geometry = null;
      wrapper.style.opacity = "0";
      // The release above takes the pointer guard with it, and this frame needs it
      // as much as the leg does: the panel is sitting at its resting size, over a
      // cursor that has not moved, and the next frame collapses it onto the
      // trigger. That is a `pointerleave` on whatever row the cursor was over —
      // see `pin`, which is one frame too late to prevent it.
      shape.style.pointerEvents = "none";
    } else if (state.geometry) {
      // A dismissal keeps the box the entrance measured. It was read while the
      // panel was on screen, so it is the honest one, and re-reading it here
      // would hit exactly the layout this file cannot trust. Only the trigger is
      // re-resolved, which is how one that moved while the panel was open still
      // gets collapsed into.
      readTokens(state);
      state.geometry = { ...state.geometry, source: readSource(state.anchor) };
      pin(state);
    }
  }

  if (state.geometry && !state.geometry.source) {
    // Nothing to grow out of — a trigger that was unmounted, or a layer opened
    // without one. The CSS entrance is the whole animation there.
    release(state);
    return;
  }

  state.from = state.progress;
  state.fromMorph = state.morph;
  state.target = target;
  state.duration = Math.max(
    1,
    (target === 1 ? state.enter : state.exit) * Math.abs(target - state.progress),
  );
  state.started = view.performance.now();
  // A dismissal is on Base UI's clock: the layer is unmounted when the
  // sentinel's animation ends, so reading that animation's own progress is what
  // makes the collapse land on the trigger exactly as the layer is removed.
  state.sentinel = target === 0 ? exitSentinel(wrapper) : null;
  state.clock = null;
  // Painted here, not on the first frame, whenever the geometry is already
  // known: the layout effect that calls this runs before the browser paints, so
  // a leg that waited for its first `requestAnimationFrame` would show the layer
  // at full size for one frame. The first leg has nothing to paint yet and is
  // hidden instead, which is the same frame spent the other way.
  if (state.geometry) paint(state);
  // One loop per layer. `start` is reached with a frame still pending whenever a
  // leg is retargeted mid-flight, and scheduling on top of that one would leave
  // two loops sharing `progress` and each rescheduling the other forever.
  cancel(state);
  state.frame = view.requestAnimationFrame(() => step(state));
}

/**
 * Drive a layer's reveal.
 *
 * The effect runs on mount and whenever `open` changes, and either starts a leg
 * or retargets the one in flight. Everything else — measurement, pinning,
 * painting — happens outside React; a layer that re-rendered per frame would put
 * the reconciler inside the animation, and Lisse's corner machinery with it.
 */
export function useSurfaceReveal({
  wrapper,
  shape,
  content,
  anchor,
  open,
}: SurfaceRevealOptions): void {
  const runtime = useRef<Runtime>({
    view: null,
    wrapper: null,
    shape: null,
    content: null,
    anchor: null,
    progress: 0,
    morph: 0,
    fromMorph: 0,
    target: 1,
    geometry: null,
    frame: 0,
    from: 0,
    started: 0,
    duration: 0,
    enter: 380,
    exit: 160,
    omega: 10.05,
    zeta: 0.567,
    clock: null,
    sentinel: null,
  });

  useIsomorphicLayoutEffect(() => {
    const state = runtime.current;
    if (state.wrapper !== wrapper) {
      // A new wrapper is a new layer: it starts at its trigger.
      stop(state);
      release(state);
      state.wrapper = wrapper;
      state.progress = 0;
      state.morph = 0;
      state.target = 1;
      state.geometry = null;
    }
    state.shape = shape;
    state.content = content;
    if (!wrapper || !shape || !content) {
      stop(state);
      return;
    }
    const view = wrapper.ownerDocument.defaultView;
    if (!view) return;
    state.view = view;
    state.anchor = anchor ?? null;

    const reduced = view.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduced?.matches) {
      stop(state);
      release(state);
      return;
    }

    const target = open ? 1 : 0;
    if (state.target !== target || (state.frame === 0 && state.progress !== target)) {
      start(state, target);
    }

    // A system setting can change while the layer is on screen, and a reveal
    // that carried on through it would be the one thing reduced motion is
    // asking for.
    const onPreference = () => {
      if (!reduced?.matches) return;
      stop(state);
      release(state);
    };
    reduced?.addEventListener?.("change", onPreference);
    return () => reduced?.removeEventListener?.("change", onPreference);
  }, [wrapper, shape, content, anchor, open]);

  useEffect(() => () => stop(runtime.current), []);
}
