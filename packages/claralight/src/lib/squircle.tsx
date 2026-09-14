"use client";

import { parseBorder, parseBoxShadow } from "@lisse/core";
import { type EffectsConfig, useSmoothCorners } from "@lisse/react";
import {
  type ComponentProps,
  type CSSProperties,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
  type Ref,
  type RefCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AppearanceListener,
  observeAppearance,
  observeSize,
  requestSync,
  settle,
  syncNow,
} from "@/lib/observers";
import { cn } from "@/lib/utils";

/**
 * ClaraLight's smooth-corner primitive.
 *
 * ## Why this exists instead of `corner-shape`
 *
 * Every ClaraLight corner is a smooth corner. On the web there are two ways
 * to draw that, and they are **different curve families that do not coincide**:
 *
 *   `corner-shape: superellipse()`  a true Lame superellipse, `squircle` == n=4.
 *                                   Chromium 139+ only; Safari and Firefox drop
 *                                   it at parse time.
 *   Figma corner smoothing          cubic Bezier shoulders bracketing a circular
 *                                   arc, `p = (1 + xi) * R`, residual arc
 *                                   `90 * (1 - xi)` degrees.
 *
 * ClaraLight follows the design, the design lives in Figma, and there the
 * second construction is the one drawn — it is also the same family as Apple's
 * `cornerCurve = .continuous`. So `corner-shape` is deliberately unused, and
 * `@lisse/react` emits this path in every engine instead, which means Safari,
 * Firefox and Chromium agree pixel for pixel rather than approximately.
 *
 * ## Why a hook and an explicit wrapper
 *
 * Lisse renders borders and shadows as **SVG overlays appended to an anchor
 * element**, because `clip-path` clips the element's own painted border and box
 * shadow to nothing. That anchor has to be a positioned box that tightly wraps
 * the shape, and `<SmoothCorners>` would otherwise invent one — which would
 * leave a `Card` no longer a direct grid or flex child.
 *
 * Owning the wrapper here keeps both halves addressable and their roles
 * explicit: `wrapperClassName` is layout, `className` is appearance. It also
 * lets a caller promote the wrapper into whatever layout slot the component
 * already occupied.
 *
 * ## The focus-ring problem
 *
 * `clip-path` crops `outline` too, so `:focus-visible` rings cannot live on the
 * clipped element. Components that need a ring put it on an ancestor instead —
 * see `button.tsx`. Surfaces like `Card` and the dialog panel draw the focus
 * inside themselves, so they are unaffected.
 *
 * ## Flat surfaces
 *
 * At radius 0 all of the above is machinery for drawing a rectangle. So a
 * surface that *measures* zero — `radius="none"`, an authored
 * `borderRadius: 0`, or a scope that zeroes the token — drops out of it: no
 * generated path, no SVG overlay, and the native `border` and `box-shadow`
 * paint themselves rather than being masked out and redrawn. The measurement
 * keeps running, so a surface that stops being flat picks the shape back up.
 *
 * The one thing that cannot lapse is the clip: it holds the content in, and it
 * establishes the backdrop root the scroll area's edge blur reads. A static
 * `clip-path: inset(0)` in `base.css` keeps both; that rule records what else
 * was measured as a substitute and rejected.
 */

/**
 * Corner radius tokens declared as `--radius-*` in theme.css.
 *
 * `none` is not merely `0px`: a surface that measures a zero radius stops
 * being a generated shape at all. See "Flat surfaces" above.
 */
export type RadiusToken = "none" | "control" | "medium" | "panel" | "sheet" | "dialog" | "capsule";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface SquircleProps extends ComponentProps<"div"> {
  /** Which `--radius-*` token shapes the corners. */
  radius: RadiusToken;
  /**
   * Figma's `xi`. `0` is a plain circular arc identical to `border-radius`;
   * `1` removes the arc entirely and leaves only Beziers. Defaults to
   * `--cl-corner-smoothing`, which is Figma's own default.
   */
  smoothing?: number;
  /**
   * Classes for the wrapper: grid/flex placement, transforms, and the focus
   * ring. This element — not the clipped one — participates in the caller's
   * layout, and it is also what has to move when the shape moves.
   */
  wrapperClassName?: string;
  /**
   * The wrapper, which is the element a caller's transform belongs on — and the
   * only way to observe the box the shape is clipped to. `ref` is the shape's,
   * because that is what a caller interacts with; this is the box around it.
   */
  wrapperRef?: Ref<HTMLDivElement> | undefined;
  /**
   * Put the ClaraLight focus ring on the wrapper.
   *
   * The ring cannot live on the shape: `clip-path` crops `outline` to nothing.
   * Measured, a 2px ring at 2px offset goes from 436 lit pixels to 0. So the
   * ring goes on the wrapper and is driven by `:has(> [data-cl-squircle]
   * :focus-visible)` in `base.css`, which keeps the browser's keyboard/pointer
   * heuristic and preserves the 2px offset the design asks for.
   *
   * Off by default because surfaces do not take focus.
   */
  ring?: boolean | "field";
  /**
   * Merge the clipped element's props onto a single child instead of rendering
   * a `div` around `children`.
   *
   * Needed because the clipped element is often a primitive that must own its
   * own tag — Base UI's `Button`, `Input` and `Select.Trigger` all render the
   * real interactive element and carry its behaviour. Wrapping them in a `div`
   * would leave the interactive element inside an inert box.
   */
  asChild?: boolean;
  /** Classes for the shape itself: fill, border, shadow, padding. */
  className?: string;
  children?: ReactNode;
}

export function Squircle({
  radius,
  smoothing,
  wrapperClassName,
  wrapperRef,
  ring = false,
  asChild = false,
  className,
  children,
  ref: forwardedRef,
  style,
  ...props
}: SquircleProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  // Lisse 0.7.2 binds its observer/effects lifecycle to the ref object, not
  // ref.current. Replace that object only when the actual DOM node changes
  // (asChild tag/key changes or a primitive temporarily rendering null).
  const ref = useMemo(() => ({ current: element }), [element]);
  const internalWrapperRef = useRef<HTMLDivElement>(null);
  const mergedWrapperRef = useMemo(() => composeRefs(internalWrapperRef, wrapperRef), [wrapperRef]);
  const border = `var(--radius-${radius})`;
  const child = asChild ? getShapeChild(children) : undefined;
  const childProps = child?.props as ComponentProps<"div"> | undefined;
  const childRef = childProps?.ref;
  const mergedRef = useMemo(
    () => composeRefs(setElement, forwardedRef, childRef),
    [forwardedRef, childRef],
  );
  const mergedStyle = { ...style, ...childProps?.style };
  const mergedClassName = cn(className, childProps?.className);
  // A uniform authored radius overrides the token for SSR, clipping and SVG.
  const renderedRadius = mergedStyle.borderRadius ?? border;
  const measuredRadius =
    typeof renderedRadius === "number" ? `${renderedRadius}px` : renderedRadius;
  // Every declarative input that can move the shape's computed style. A render
  // that leaves all of them alone leaves the measurement alone too — anything
  // else that could have moved arrives as an observer signal, not as a render.
  const syncKey = JSON.stringify([measuredRadius, smoothing, mergedStyle, mergedClassName]);
  const appearance = useAppearance(ref, measuredRadius, smoothing, mergedStyle, syncKey);
  // Only once the radius has actually been read: the pre-measurement state is
  // also a zero, and treating that as flat would square every corner for the
  // render between mount and the first measurement.
  const flat = appearance.measured && appearance.corners.radius === 0;
  // Lisse keys its whole lifecycle on the ref object and does nothing with one
  // that holds null, so this is also how the shape is handed back: swapping the
  // object runs its cleanup, which removes the overlays and restores the clip.
  const emptyRef = useRef<HTMLElement | null>(null);
  const cornersRef = flat ? emptyRef : ref;

  // 0.7.2's autoEffects only extracts at mount. Explicit effects are compared
  // by value on every commit, so theme/variant changes update the existing SVG.
  useSmoothCorners(cornersRef, appearance.corners, {
    wrapperRef: internalWrapperRef,
    autoEffects: false,
    effects: appearance.effects,
    // 0.7.2 otherwise keeps an existing shadow handle with DEFAULT_SHADOW
    // when an explicit shadow disappears (e.g. panel -> control).
    skipShadowHandle: !appearance.effects.shadow,
    fallbackBorderRadius: measuredRadius,
  });

  // Swapping Lisse's ref object runs its cleanup, and that cleanup restores the
  // inline `border-radius` it snapshotted when it mounted — one radius stale by
  // the time the surface has gone flat. React will not rewrite a value it did
  // not itself change, so re-assert it here. Declared after `useSmoothCorners`,
  // which is what puts this effect after that cleanup. Shaped surfaces are left
  // alone: there, Lisse owns the property and deliberately clears it.
  useIsomorphicLayoutEffect(() => {
    if (flat && ref.current) ref.current.style.borderRadius = measuredRadius;
  }, [ref, flat, measuredRadius]);

  const shapeProps = {
    ...props,
    ref: mergedRef,
    "data-cl-squircle": radius,
    // Drives the static rectangle clip in base.css, which is the part of the
    // generated shape a flat surface still needs.
    "data-cl-flat": flat ? "" : undefined,
    style: { ...mergedStyle, borderRadius: renderedRadius },
    className: mergedClassName,
  };

  return (
    <div
      ref={mergedWrapperRef}
      style={{ "--cl-squircle-radius": measuredRadius } as CSSProperties}
      className={cn(
        "relative",
        ring === true && "cl-squircle-root",
        ring === "field" && "cl-squircle-root cl-squircle-field",
        wrapperClassName,
      )}
    >
      {child ? cloneElement(child, shapeProps) : <div {...shapeProps}>{children}</div>}
    </div>
  );
}

function getShapeChild(child: ReactNode) {
  if (!isValidElement<ComponentProps<"div">>(child) || child.type === Fragment) {
    throw new Error("Squircle: `asChild` expects exactly one non-Fragment React element.");
  }
  return child;
}

/** React 19: a cleanup-returning callback must not also receive null. */
export function composeRefs<T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> {
  return (node) => {
    const cleanups = refs.map((ref) => {
      if (typeof ref === "function") {
        const cleanup = ref(node);
        return typeof cleanup === "function" ? cleanup : () => ref(null);
      }
      if (ref) {
        ref.current = node;
        return () => {
          ref.current = null;
        };
      }
      return undefined;
    });
    return () => {
      for (const cleanup of cleanups) cleanup?.();
    };
  };
}

const hiddenStyles = {
  "border-top-color": "transparent",
  "border-right-color": "transparent",
  "border-bottom-color": "transparent",
  "border-left-color": "transparent",
  "box-shadow": "none",
} as const;

type HiddenProperty = keyof typeof hiddenStyles;
type SavedStyle = { value: string; priority: string };

/**
 * Read the actual shape's cascade, not documentElement: local themes, rem/calc
 * radii, inline tokens and nested light/dark scopes all work.
 *
 * Every signal arrives through the shared observers in `observers.ts`, and the
 * work is handed over as three phases rather than one callback. A resample has
 * to write a probe radius before it can read one back, and reading a computed
 * style after writing one forces the engine to recalculate on the spot — so a
 * page of surfaces answering a theme toggle one at a time costs one forced
 * recalculation each. Split into phases, the batch writes every probe, takes
 * every reading, then puts every element back, and costs one for all of them.
 *
 * There is still no frame polling: nothing runs unless something moved.
 */
function useAppearance(
  ref: { current: HTMLElement | null },
  border: string,
  smoothing: number | undefined,
  style: CSSProperties,
  syncKey: string,
) {
  const [appearance, setAppearance] = useState({
    // Not design defaults: SSR uses the CSS border-radius, before measurement.
    measured: false,
    corners: { radius: 0, smoothing: 0 },
    effects: {} as EffectsConfig,
  });
  const latest = useRef({ border, smoothing, style, syncKey });
  latest.current = { border, smoothing, style, syncKey };
  const syncRef = useRef<(() => void) | null>(null);
  /** The key the element was last measured at, so a no-op render stays one. */
  const syncedKey = useRef<string | null>(null);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;
    const saved = new Map<HiddenProperty, SavedStyle>();
    let previousStyle = "";
    const restore = () => {
      for (const [property, source] of saved) {
        // An imperative or React inline update takes precedence over our mask.
        if (
          element.style.getPropertyValue(property) === hiddenStyles[property] &&
          element.style.getPropertyPriority(property) === "important"
        ) {
          element.style.setProperty(property, source.value, source.priority);
        }
      }
      saved.clear();
    };

    /** The radius `prepare` displaced and `commit` has to put back. */
    let probe: { radius: string } | null = null;
    /** What `measure` read, for `commit` to act on. */
    let sample: { radius: number; smoothing: number; effects: EffectsConfig } | null = null;
    /**
     * The authored `transition`, displaced by `prepare` and put back by
     * `release` — never by `commit`.
     *
     * Masking the border and shadow is a style change like any other, so a
     * `transition` that is live in the same batch animates it: a field that
     * transitions `border-color` fades its real 1px border out from under the
     * SVG one instead of having it hidden. Worse, the fade ends in a
     * `transitionend`, which is itself a resample signal — so the surface
     * re-masks, re-fades, and flickers for as long as it is mounted. Restoring
     * only once the batch has resolved the mask compares transparent against
     * transparent and starts nothing.
     *
     * Suppressing and restoring are the same pair of writes whatever the
     * measurement found, so they sit in the two phases that always run, not in
     * the one that can bail out early.
     */
    let suppressed: { value: string; priority: string } | null = null;

    const listener: AppearanceListener = {
      prepare() {
        probe = { radius: element.style.borderTopLeftRadius };
        // Sample target CSS, not a transition starting from our mask.
        suppressed ??= {
          value: element.style.getPropertyValue("transition"),
          priority: element.style.getPropertyPriority("transition"),
        };
        element.style.setProperty("transition", "none", "important");
        restore();
        const current = latest.current;
        // React may write the same value as our mask (e.g. shadow -> none).
        // Reconcile declarative border/shadow styles before a new snapshot.
        const authored = JSON.stringify(current.style);
        if (authored !== previousStyle) {
          if (previousStyle !== "") {
            const source = element.ownerDocument.createElement("div").style;
            for (const [key, value] of Object.entries(current.style)) {
              if (/^border.*(?:Color)?$/.test(key) && !/Width|Radius/.test(key)) {
                source.setProperty(
                  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
                  String(value),
                );
              }
            }
            source.boxShadow = current.style.boxShadow ?? "";
            for (const property of Object.keys(hiddenStyles) as HiddenProperty[]) {
              element.style.setProperty(property, source.getPropertyValue(property));
            }
          }
          previousStyle = authored;
        }
        // Let the browser resolve units, calc() and inherited custom properties.
        element.style.borderTopLeftRadius = current.border;
      },

      measure() {
        if (!probe) return;
        const current = latest.current;
        const computed = view.getComputedStyle(element);
        const radiusValue = computed.borderTopLeftRadius;
        const radius = radiusValue.endsWith("%")
          ? (Number.parseFloat(radiusValue) * Math.min(element.clientWidth, element.clientHeight)) /
            100
          : Number.parseFloat(radiusValue);
        const tokenSmoothing = Number.parseFloat(
          computed.getPropertyValue("--cl-corner-smoothing"),
        );
        sample = {
          radius: Number.isFinite(radius) ? Math.max(0, radius) : 0,
          smoothing: Math.min(
            1,
            Math.max(
              0,
              current.smoothing ?? (Number.isFinite(tokenSmoothing) ? tokenSmoothing : 0),
            ),
          ),
          effects: {
            innerBorder: parseBorder(element, computed),
            ...parseBoxShadow(computed.boxShadow),
          },
        };
      },

      commit() {
        const displaced = probe;
        const measured = sample;
        probe = null;
        sample = null;
        if (!displaced || !measured) return;
        element.style.borderTopLeftRadius = displaced.radius;
        if (element.style.clipPath) {
          element.style.borderRadius = "";
        }
        const next = {
          measured: true,
          corners: { radius: measured.radius, smoothing: measured.smoothing },
          effects: measured.effects,
        };
        // A flat surface paints its own border and shadow, so there is nothing
        // to hide. `prepare` already restored whatever the last pass masked.
        const flat = measured.radius === 0;
        for (const property of flat ? [] : (Object.keys(hiddenStyles) as HiddenProperty[])) {
          if (
            property === "box-shadow"
              ? next.effects.shadow || next.effects.innerShadow
              : next.effects.innerBorder
          ) {
            saved.set(property, {
              value: element.style.getPropertyValue(property),
              priority: element.style.getPropertyPriority(property),
            });
            // Keep border widths/layout; Lisse's autoEffects instead sets border:0.
            element.style.setProperty(property, hiddenStyles[property], "important");
          }
        }
        syncedKey.current = latest.current.syncKey;
        setAppearance((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      },

      release() {
        const authored = suppressed;
        suppressed = null;
        if (!authored) return;
        element.style.setProperty("transition", authored.value, authored.priority);
      },
    };

    /**
     * React drives this one, so it stays synchronous: a variant change has to
     * be measured in the commit that caused it, not a frame later.
     */
    const sync = () => {
      syncNow(element, listener);
      settle(element);
    };

    const onInteraction = (event: Event) => {
      if (event.type === "transitionend" || event.type === "animationend") {
        if (event.target !== element) return;
      } else if (event.type === "pointerover" || event.type === "pointerout") {
        const related = (event as PointerEvent).relatedTarget;
        if (related instanceof view.Node && element.contains(related)) return;
      }
      // Crossing a boundary fires `pointerout` here and `pointerover` there in
      // the same tick; the batch is what keeps that a single measurement pass.
      requestSync(element, listener);
    };
    const events = [
      "pointerover",
      "pointerout",
      "focusin",
      "focusout",
      "transitionend",
      "animationend",
    ];

    let unobserveAppearance: (() => void) | undefined;
    let unobserveSize: (() => void) | undefined;
    const cleanup = () => {
      unobserveAppearance?.();
      unobserveSize?.();
      for (const event of events) element.removeEventListener(event, onInteraction);
      syncRef.current = null;
      syncedKey.current = null;
      listener.release?.();
      restore();
    };
    try {
      syncRef.current = sync;
      unobserveAppearance = observeAppearance(element, listener);
      unobserveSize = observeSize(element, listener);
      for (const event of events) element.addEventListener(event, onInteraction);
      sync();
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [ref]);

  // Only the inputs React itself can change need a synchronous resample; a
  // parent re-render or new children cannot move the cascade, and everything
  // that can is a signal the shared observers already carry.
  useIsomorphicLayoutEffect(() => {
    if (syncedKey.current === syncKey) return;
    syncRef.current?.();
  }, [syncKey]);
  return appearance;
}
