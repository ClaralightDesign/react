"use client";

import {
  createContext,
  type ReactNode,
  type RefCallback,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { tokenNumber } from "@/lib/utils";

/**
 * The ClaraLight surface morph.
 *
 * A floating layer does not fade in and it does not pop: it **grows out of the
 * rectangle that opened it**. The layer is laid out at its final size, and the
 * projective transform below carries that box from the source rectangle onto
 * itself, so the fill, the 1px outline, the shadow and the content cross the
 * movement as one object.
 *
 * ## Why a quad, and not a scale
 *
 * A scale about one corner reads as a photograph being enlarged: opposite edges
 * stay parallel, so nothing about the movement says where the layer came from or
 * where it is going. Here the four corners travel on **four different curves** —
 * the further a corner has to go, the earlier it leaves and the longer it takes
 * to arrive — so the quad stops being a rectangle on the way across and reads as
 * a surface turning in space. That is the whole effect; the matrix only keeps the
 * four interpolated corners coherent with each other.
 *
 * The corner curves are the Flutter dialog's, kept verbatim so that the two
 * implementations are one animation rather than two that resemble each other:
 *
 *   x1 = 0.35 - 0.20r    y1 = 0.85r
 *   x2 = 0.45 - 0.20r    y2 = 1
 *
 * with `r` the corner's share of the longest journey. At `r = 1` the curve
 * leaves at slope 5.7 and lands softly; at `r = 0` it waits, then catches up at
 * slope 1.8. Every curve is monotonic and ends at 1, so a corner never travels
 * past its target and the layer is only ever *downscaled* on the way in — which
 * matters on Safari, where Lisse's `clip-path` raster is cached at layout size.
 *
 * ## One progress, two legs
 *
 * The content's opacity is not a separate transition. It is read from the same
 * progress the geometry is, `easeOut(t / 0.35)`, which is what lets a dismissal
 * be *watched*: the layer stays opaque through the first two thirds of the way
 * back and collapses visibly into its trigger. On the entrance's own `ease-out`
 * clock instead, the layer is empty before the geometry has moved a fifth of the
 * way, and the exit reads as a fade with no animation in it at all — the corner
 * curves are asymmetric on purpose, so playing them backwards holds the shape
 * near its target until late. A dismissal starts that fade slightly early; see
 * `REVEAL_LEAD`, which is about the frame it is removed on rather than taste.
 *
 * ## Where the transform goes
 *
 * On the wrapper that carries the shape, never on the shape itself: Lisse paints
 * the outline and the shadow as SVG overlays that are siblings of the clipped
 * element, so a transform below the wrapper would move the fill out from under
 * its own border. Same reason as the entrance in `base.css`, which is why this
 * file hands that entrance its geometry instead of adding to it.
 *
 * ## Resting state
 *
 * Both rectangles are expressed relative to the layer's **own resting box**, so
 * `progress = 1` is exactly the identity matrix. Nothing has to agree about
 * pixels later: the inline geometry is dropped once the entrance lands and the
 * CSS state describes the same frame, and reduced motion — which never runs this
 * file at all — is the same layer with no transform present.
 *
 * `cl-morph` is the switch between the two, and it is declared in the markup
 * rather than set from the effect that drives this file: changing the computed
 * `scale` is what starts the CSS transition, so a component that reported itself
 * as morphed a frame late would animate the nudge it was replacing.
 * ## Cost
 *
 * One layout read per leg, then one property write per frame: no measurement, no
 * React render and no layout in the loop. Four corners, four cubic inversions
 * and a 3x3 solve per frame is nothing; what the transform costs is on the
 * compositor, which is where `backdrop-filter` lives. See the dialog's own note
 * on the frost.
 */

export interface MorphPoint {
  x: number;
  y: number;
}

export interface MorphRect extends MorphPoint {
  width: number;
  height: number;
}

export interface MorphBox {
  width: number;
  height: number;
}

/** Top-left, top-right, bottom-left, bottom-right — the order the matrix solves in. */
export type MorphQuad = [MorphPoint, MorphPoint, MorphPoint, MorphPoint];

/** A `matrix3d()` argument list, in the order CSS reads it. */
export type MorphMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * How small a layer starts when it has no source to grow from.
 *
 * The Flutter dialog does the same thing when its trigger has been disposed
 * between opening and dismissing: a layer with nowhere to go back to shrinks
 * towards its own centre rather than being sent somewhere it never came from.
 */
const ORPHAN_SCALE = 0.3;

/** The identity, in `matrix3d()` argument order. */
const IDENTITY: MorphMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * How far into a leg the content is fully revealed, and how it gets there.
 *
 * The Flutter dialog's `easeOut(t / 0.35)`, kept with the corner curves because
 * it is the same construction: a progress the whole layer shares. The select
 * fades its list on a curve of its own (`pow(t, 0.6)`, on a controller with a
 * duration of its own); this is the one the two surfaces agree on.
 *
 * `Curves.easeOut` in Flutter is `Cubic(0, 0, 0.58, 1)`, which is not the
 * `--ease-cl-out` the design system uses elsewhere — the morph's legs are its own
 * numbers, and only the durations come from tokens.
 */
const REVEAL = 0.35;
const REVEAL_CURVE = { x1: 0, y1: 0, x2: 0.58, y2: 1 } as const;

/**
 * How far ahead of the geometry the content is gone on a dismissal.
 *
 * Base UI unmounts the layer when the exit sentinel's animation ends, and that end
 * lands in the same rendering update as this file's last frame — earlier in it, in
 * fact, because animation events are dispatched before animation frame callbacks.
 * Whatever that final frame writes is therefore never on screen, and a dismissal's
 * last tenth is its fastest-moving part: the corners hold near the target and then
 * collapse, so the layer would be removed while still plainly visible — measured
 * at 33% opacity, mid-collapse. Starting the fade a frame and a half early leaves
 * the last thing on screen already empty, and puts the disappearance where nothing
 * is moving.
 *
 * Only a dismissal: an entrance has nothing to race, and keeps the Flutter fade
 * exactly as it is.
 */
const REVEAL_LEAD = 0.15;

/** A cubic Bézier on one axis, with `P0 = 0` and `P3 = 1`. */
const axis = (a: number, b: number, u: number) => {
  const m = 1 - u;
  return 3 * m * m * u * a + 3 * m * u * u * b + u * u * u;
};

/**
 * `cubic-bezier(x1, y1, x2, y2)` evaluated at `x`, the way CSS evaluates it.
 *
 * The curve is parametric: `x` is not the parameter, so `x` has to be inverted
 * before `y` can be read. Newton converges in a few steps for the control points
 * this file uses, where `x(u)` is monotonic; the bracket keeps a caller's own
 * parameters from stepping off the curve when a slope goes flat.
 */
function bezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let low = 0;
  let high = 1;
  let u = x;
  for (let step = 0; step < 8; step++) {
    const error = axis(x1, x2, u) - x;
    if (Math.abs(error) < 1e-6) break;
    if (error > 0) high = u;
    else low = u;
    const slope = 3 * (1 - u) ** 2 * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u ** 2 * (1 - x2);
    if (slope === 0) break;
    u = Math.min(high, Math.max(low, u - error / slope));
  }
  return axis(y1, y2, u);
}

/**
 * Where one corner is at `progress`, along the straight line from the source
 * rectangle to the target one.
 *
 * The corners do not share a curve, and that is the effect: a corner with a long
 * way to travel leaves early and eases into place, one that barely moves waits
 * and snaps in behind it. Four straight lines on four clocks is what turns a
 * rectangle into a trapezoid on the way across.
 */
function corner(ratio: number, progress: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  return bezier(0.35 - 0.2 * r, 0.85 * r, 0.45 - 0.2 * r, 1, progress);
}

/**
 * The quad a layer covers at `progress`, in its own resting coordinates.
 *
 * `source` is the rectangle that opened it, relative to the same box. `null`
 * means there is nothing to grow out of, and the layer starts as a small centred
 * rect instead.
 */
export function morphQuad(box: MorphBox, source: MorphRect | null, progress: number): MorphQuad {
  const target: MorphQuad = [
    { x: 0, y: 0 },
    { x: box.width, y: 0 },
    { x: 0, y: box.height },
    { x: box.width, y: box.height },
  ];
  const inset = (1 - ORPHAN_SCALE) / 2;
  const from: MorphQuad = source
    ? [
        { x: source.x, y: source.y },
        { x: source.x + source.width, y: source.y },
        { x: source.x, y: source.y + source.height },
        { x: source.x + source.width, y: source.y + source.height },
      ]
    : [
        { x: box.width * inset, y: box.height * inset },
        { x: box.width * (1 - inset), y: box.height * inset },
        { x: box.width * inset, y: box.height * (1 - inset) },
        { x: box.width * (1 - inset), y: box.height * (1 - inset) },
      ];

  const clamped = Math.min(1, Math.max(0, progress));
  const journey = (index: 0 | 1 | 2 | 3) =>
    Math.hypot(target[index].x - from[index].x, target[index].y - from[index].y);
  const longest = Math.max(journey(0), journey(1), journey(2), journey(3), 1);
  const landed = (index: 0 | 1 | 2 | 3) => {
    const arrived = corner(journey(index) / longest, clamped);
    return {
      x: from[index].x + (target[index].x - from[index].x) * arrived,
      y: from[index].y + (target[index].y - from[index].y) * arrived,
    };
  };

  return [landed(0), landed(1), landed(2), landed(3)];
}

/**
 * The projective transform that carries a `box` onto `quad`, in `matrix3d()`
 * argument order.
 *
 * This is the Flutter dialog's `_computeHomography`, and the transposition is
 * the one thing that can not be copied literally. Flutter writes its matrix for
 * column vectors — `v' = M·v`, so its translation sits in the last *column* —
 * while CSS transforms a row vector, `(x, y, 0, 1)·M`, and takes its arguments
 * column by column. The two arrays are transposes of each other: the translation
 * ends up at 12..14 in both, which is exactly why the mistake survives a visual
 * check, but the perspective terms are Flutter's `storage[3]` and `storage[7]`
 * and CSS's `args[3]` and `args[7]` — the pair that makes the quad a trapezoid
 * instead of a parallelogram.
 *
 * A quad that has collapsed to a line or a point has no inverse; the perspective
 * terms stay zero and the corners are placed affinely rather than the layer
 * disappearing.
 */
export function homographyMatrix(box: MorphBox, quad: MorphQuad): MorphMatrix {
  const [p1, p2, p3, p4] = quad;
  const { width, height } = box;
  if (width <= 0 || height <= 0) return [...IDENTITY];

  const a = (p2.x - p4.x) * width;
  const b = (p3.x - p4.x) * height;
  const d = (p2.y - p4.y) * width;
  const e = (p3.y - p4.y) * height;
  const c = p4.x - p2.x - p3.x + p1.x;
  const f = p4.y - p2.y - p3.y + p1.y;

  const determinant = a * e - b * d;
  let m30 = 0;
  let m31 = 0;
  if (Math.abs(determinant) > 1e-6) {
    m30 = (c * e - b * f) / determinant;
    m31 = (a * f - c * d) / determinant;
  }

  const m00 = (p2.x - p1.x + m30 * width * p2.x) / width;
  const m10 = (p2.y - p1.y + m30 * width * p2.y) / width;
  const m01 = (p3.x - p1.x + m31 * height * p3.x) / height;
  const m11 = (p3.y - p1.y + m31 * height * p3.y) / height;

  return [
    flat(m00),
    flat(m10),
    0,
    flat(m30),
    flat(m01),
    flat(m11),
    0,
    flat(m31),
    0,
    0,
    1,
    0,
    p1.x,
    p1.y,
    0,
    1,
  ];
}

/** The transform a layer at `progress` should carry, ready to serialise. */
export function morphMatrix(
  box: MorphBox,
  source: MorphRect | null,
  progress: number,
): MorphMatrix {
  return homographyMatrix(box, morphQuad(box, source, progress));
}

/* ---------------------------------------------------------------------------
 * The layer
 * ------------------------------------------------------------------------- */

export interface MorphSource {
  /** The element the layer grows out of. Written by the trigger, read on demand. */
  anchor: RefObject<HTMLElement | null>;
  /** Whether the layer is open, owned by the component that owns the state. */
  open: boolean;
}

const MorphSourceContext = createContext<MorphSource | null>(null);

/**
 * Publishes the trigger to the layer it opens, and the open state with it.
 *
 * A ref rather than state: the anchor is already in the DOM by the time a layer
 * needs it, and a render in between would only delay the first measured frame.
 * The value is memoised on `open` alone, so a parent re-render does not detach
 * the ref the trigger registered.
 */
export function MorphSourceProvider({ open, children }: { open: boolean; children: ReactNode }) {
  const anchor = useRef<HTMLElement | null>(null);
  const source = useMemo(() => ({ anchor, open }), [open]);
  return <MorphSourceContext.Provider value={source}>{children}</MorphSourceContext.Provider>;
}

export function useMorphSource(): MorphSource | null {
  return useContext(MorphSourceContext);
}

/**
 * Registers the element its layer should grow out of.
 *
 * Returns `null` outside a provider, so a component used without one degrades
 * to the plain CSS entrance instead of failing.
 */
export function useMorphAnchor(): RefCallback<HTMLElement> | null {
  const anchor = useContext(MorphSourceContext)?.anchor ?? null;
  return useMemo(() => {
    if (!anchor) return null;
    return (element: HTMLElement | null) => {
      anchor.current = element;
      return () => {
        if (anchor.current === element) anchor.current = null;
      };
    };
  }, [anchor]);
}

export interface SurfaceMorphOptions {
  /** The wrapper that carries the layer. The transform is written here. */
  surface: HTMLElement | null;
  /** Resolved at the start of every leg, so a source that moved is followed. */
  anchor?: RefObject<HTMLElement | null> | null;
  /** Whether the layer is open. */
  open: boolean;
}

interface Geometry {
  /** The layer's own box, at rest, in viewport coordinates. */
  box: MorphRect;
  /** The rectangle it grows out of, in viewport coordinates. */
  source: MorphRect | null;
}

interface Runtime {
  /**
   * The exit sentinel's animation, when the layer has one: the clock Base UI
   * unmounts on, read rather than duplicated.
   *
   * Looked for per frame instead of read once, because a CSS animation is created
   * in the rendering update rather than by a style recalculation: on the frame a
   * dismissal starts, the popup already carries `data-ending-style` and the
   * animation that matches it does not exist yet.
   */
  clock: Animation | null;
  /** The exit sentinel, which is the element the clock will be attached to. */
  sentinel: HTMLElement | null;
  view: Window | null;
  element: HTMLElement | null;
  anchor: RefObject<HTMLElement | null> | null;
  /** Where the layer is now, 0 at the source, 1 at rest. */
  progress: number;
  target: 0 | 1;
  /** Measured once per leg; `null` until a leg finds a source to grow from. */
  geometry: Geometry | null;
  frame: number;
  from: number;
  started: number;
  duration: number;
  enter: number;
  exit: number;
}

/** Six decimals is past the point a transform is distinguishable and short enough to write. */
const round = (value: number) => Number(value.toFixed(6));

/** `-0` is not a different transform, and it is noise in a serialised matrix. */
const flat = (value: number) => (value === 0 ? 0 : value);

const rectOf = (rect: DOMRect): MorphRect => ({
  x: rect.x,
  y: rect.y,
  width: rect.width,
  height: rect.height,
});

/** The element a layer should grow out of, or `null` when it is no longer there. */
function readSource(anchor: RefObject<HTMLElement | null> | null): MorphRect | null {
  const element = anchor?.current;
  return element?.isConnected ? rectOf(element.getBoundingClientRect()) : null;
}

/**
 * The exit sentinel, or `null` when the layer has none.
 *
 * The class is part of `base.css`'s own contract — the non-visual animation Base
 * UI can await while the wrapper moves — so it is looked up rather than assumed,
 * and a surface without one keeps the duration token as its clock.
 */
function exitSentinel(element: HTMLElement): HTMLElement | null {
  return element.querySelector(".cl-exit-sentinel");
}

/**
 * The layer's own box and its source, both at rest.
 *
 * The transform is lifted for the read and put straight back: a homography
 * cannot be subtracted out of a rect, and the resting box is the only honest
 * measurement of where the layer belongs. Nothing else runs in between, so the
 * browser paints the frame with the transform in place.
 */
function measure(state: Runtime): Geometry | null {
  const element = state.element;
  if (!element) return null;
  const authored = element.style.transform;
  element.style.transform = "none";
  const box = element.getBoundingClientRect();
  element.style.transform = authored;
  return { box: rectOf(box), source: readSource(state.anchor) };
}

/**
 * Drops the inline geometry, leaving the CSS state to describe the same frame.
 *
 * Opacity goes with it: at rest the CSS value is the same one — the morph's
 * neutralisation sets it to 1 — so nothing is left behind that a consumer's own
 * styles could not override.
 */
function release(element: HTMLElement | null): void {
  element?.style.removeProperty("transform");
  element?.style.removeProperty("transform-origin");
  element?.style.removeProperty("opacity");
}

function paint(state: Runtime): void {
  const element = state.element;
  const geometry = state.geometry;
  if (!element || !geometry) return;
  const { box, source } = geometry;
  const local = source
    ? { x: source.x - box.x, y: source.y - box.y, width: source.width, height: source.height }
    : null;
  const matrix = morphMatrix(box, local, state.progress).map(round);
  const leading = state.clock ? REVEAL_LEAD : 0;
  const revealed = Math.min(1, Math.max(0, (state.progress - leading) / REVEAL));
  element.style.transform = `matrix3d(${matrix.join(",")})`;
  element.style.opacity = String(
    round(bezier(REVEAL_CURVE.x1, REVEAL_CURVE.y1, REVEAL_CURVE.x2, REVEAL_CURVE.y2, revealed)),
  );
}

function stop(state: Runtime): void {
  if (state.frame && state.view) state.view.cancelAnimationFrame(state.frame);
  state.frame = 0;
  state.clock = null;
  state.sentinel = null;
}

function step(state: Runtime): void {
  state.frame = 0;
  const view = state.view;
  if (!view) return;
  state.clock ??= state.sentinel?.getAnimations()[0] ?? null;
  // `null` is the animation's before phase, which is this leg's first frame
  // rather than its last: Base UI's animation is created when the state lands and
  // starts on the frame after it.
  const elapsed = state.clock
    ? (state.clock.effect?.getComputedTiming().progress ?? 0)
    : (view.performance.now() - state.started) / state.duration;
  const ratio = Math.min(1, Math.max(0, elapsed));
  state.progress = state.from + (state.target - state.from) * ratio;
  paint(state);
  if (ratio < 1) {
    state.frame = view.requestAnimationFrame(() => step(state));
    return;
  }
  state.progress = state.target;
  state.clock = null;
  state.sentinel = null;
  // At rest the matrix is exactly the identity, so the inline geometry can go.
  // A dismissal keeps it instead: the frame it reached is the frame Base UI
  // unmounts on, and snapping back to full size for it would be a flash.
  if (state.target === 1) release(state.element);
}

/**
 * Begin a leg towards `target`, from wherever the layer actually is.
 *
 * The duration is the leg's own token scaled by the distance left, so a layer
 * caught mid-flight reverses quickly instead of replaying a full entrance
 * backwards. A dismissal mostly does not use it at all: see `clock` below.
 */
function start(state: Runtime, target: 0 | 1): void {
  const { element, view } = state;
  if (!element || !view) return;

  if (state.frame) {
    // A leg already in flight: the box has not moved, but the source may have —
    // a dismissal re-resolves its trigger, which is how a trigger that moved
    // while the layer was open stays connected to it.
    if (state.geometry) state.geometry = { ...state.geometry, source: readSource(state.anchor) };
  } else {
    // A fresh leg measures both, and the tokens with it: a fresh leg is the only
    // place the durations can have changed since the last one.
    const computed = view.getComputedStyle(element);
    state.enter = tokenNumber(computed.getPropertyValue("--cl-duration-morph")) ?? state.enter;
    state.exit = tokenNumber(computed.getPropertyValue("--cl-duration-surface")) ?? state.exit;
    state.geometry = measure(state);
  }

  if (!state.geometry) return;

  state.from = state.progress;
  state.target = target;
  state.duration = Math.max(
    1,
    (target === 1 ? state.enter : state.exit) * Math.abs(target - state.progress),
  );
  state.started = view.performance.now();
  // A dismissal is on Base UI's clock: the layer is unmounted when the sentinel's
  // animation ends. That animation starts a frame after the state change, which
  // is close enough for a hold and not close enough for the last tenth of a
  // collapse, where the corner curves are moving fastest — measured, a leg run on
  // its own timer was still at 54% opacity when the layer was removed. Reading the
  // animation's own progress makes the two one clock: the reverse leg reaches the
  // source rectangle exactly as the sentinel finishes, however the frame lands.
  state.sentinel = target === 0 ? exitSentinel(element) : null;
  state.clock = null;
  element.style.transformOrigin = "0 0";
  // Painted here, not on the first frame: the layout effect that calls this runs
  // before the browser paints, so a layer that waited for its first rAF would be
  // shown at full size for one frame.
  paint(state);
  state.frame = view.requestAnimationFrame(() => step(state));
}

/**
 * Drive a layer's morph.
 *
 * The effect runs on mount and whenever `open` changes, and either starts a leg
 * or retargets the one in flight. Everything else — measurement, painting,
 * settling — happens outside React; a layer that re-rendered per frame would put
 * the reconciler inside the animation for no gain, which is the same reason the
 * anchored tail writes into the DOM directly.
 */
export function useSurfaceMorph({ surface, anchor, open }: SurfaceMorphOptions): void {
  const runtime = useRef<Runtime>({
    view: null,
    element: null,
    anchor: null,
    progress: 0,
    target: 1,
    geometry: null,
    frame: 0,
    clock: null,
    sentinel: null,
    from: 0,
    started: 0,
    duration: 0,
    enter: 380,
    exit: 160,
  });

  useIsomorphicLayoutEffect(() => {
    const state = runtime.current;
    if (state.element !== surface) {
      // A new wrapper is a new layer: it starts at its source.
      stop(state);
      state.element = surface;
      state.progress = 0;
      state.target = 1;
      state.geometry = null;
    }
    if (!surface) {
      stop(state);
      return;
    }
    const view = surface.ownerDocument.defaultView;
    if (!view) return;
    state.view = view;
    state.anchor = anchor ?? null;

    const reduced = view.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduced?.matches) {
      // Reduced motion keeps the layer's opacity leg, which is the CSS
      // entrance's, and drops the geometry entirely.
      stop(state);
      release(surface);
      return;
    }

    const target = open ? 1 : 0;
    if (state.target !== target || (state.frame === 0 && state.progress !== target))
      start(state, target);

    // A system setting can change while the layer is on screen, and a morph that
    // carried on through it would be the one thing reduced motion is asking for.
    const onPreference = () => {
      if (!reduced?.matches) return;
      stop(state);
      release(surface);
    };
    reduced?.addEventListener?.("change", onPreference);
    return () => reduced?.removeEventListener?.("change", onPreference);
  }, [surface, anchor, open]);

  useEffect(() => () => stop(runtime.current), []);
}
