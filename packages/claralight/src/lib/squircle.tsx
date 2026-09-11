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
 */

/** Corner radius tokens declared as `--radius-*` in theme.css. */
export type RadiusToken = "control" | "medium" | "panel" | "sheet" | "dialog" | "capsule";

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
  // A uniform authored radius overrides the token for SSR, clipping and SVG.
  const renderedRadius = mergedStyle.borderRadius ?? border;
  const measuredRadius =
    typeof renderedRadius === "number" ? `${renderedRadius}px` : renderedRadius;
  const appearance = useAppearance(ref, measuredRadius, smoothing, mergedStyle);

  // 0.7.2's autoEffects only extracts at mount. Explicit effects are compared
  // by value on every commit, so theme/variant changes update the existing SVG.
  useSmoothCorners(ref, appearance.corners, {
    wrapperRef: internalWrapperRef,
    autoEffects: false,
    effects: appearance.effects,
    // 0.7.2 otherwise keeps an existing shadow handle with DEFAULT_SHADOW
    // when an explicit shadow disappears (e.g. panel -> control).
    skipShadowHandle: !appearance.effects.shadow,
    fallbackBorderRadius: measuredRadius,
  });

  const shapeProps = {
    ...props,
    ref: mergedRef,
    "data-cl-squircle": radius,
    style: { ...mergedStyle, borderRadius: renderedRadius },
    className: cn(className, childProps?.className),
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
 * radii, inline tokens and nested light/dark scopes all work. Observers and
 * interaction/resize events resample on changes; there is no frame polling.
 */
function useAppearance(
  ref: { current: HTMLElement | null },
  border: string,
  smoothing: number | undefined,
  style: CSSProperties,
) {
  const [appearance, setAppearance] = useState({
    // Not design defaults: SSR uses the CSS border-radius, before measurement.
    corners: { radius: 0, smoothing: 0 },
    effects: {} as EffectsConfig,
  });
  const latest = useRef({ border, smoothing, style });
  latest.current = { border, smoothing, style };
  const syncRef = useRef<(() => void) | null>(null);

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
    const observer =
      typeof view.MutationObserver === "function"
        ? new view.MutationObserver(() => sync())
        : undefined;
    const resize =
      typeof view.ResizeObserver === "function" ? new view.ResizeObserver(() => sync()) : undefined;
    const scheme = view.matchMedia?.("(prefers-color-scheme: dark)");
    const sync = () => {
      // Sample target CSS, not a transition starting from our transparent mask.
      const transition = element.style.getPropertyValue("transition");
      const transitionPriority = element.style.getPropertyPriority("transition");
      element.style.setProperty("transition", "none", "important");
      restore();
      const current = latest.current;
      // React may write the same value as our mask (e.g. shadow -> none).
      // Reconcile declarative border/shadow styles before taking a new snapshot.
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
      const oldRadius = element.style.borderTopLeftRadius;
      element.style.borderTopLeftRadius = current.border;
      const computed = view.getComputedStyle(element);
      const radiusValue = computed.borderTopLeftRadius;
      const radius = radiusValue.endsWith("%")
        ? (Number.parseFloat(radiusValue) * Math.min(element.clientWidth, element.clientHeight)) /
          100
        : Number.parseFloat(radiusValue);
      const tokenSmoothing = Number.parseFloat(computed.getPropertyValue("--cl-corner-smoothing"));
      const effects: EffectsConfig = {
        innerBorder: parseBorder(element, computed),
        ...parseBoxShadow(computed.boxShadow),
      };
      element.style.borderTopLeftRadius = oldRadius;
      if (element.style.clipPath) {
        element.style.borderRadius = "";
      }
      const next = {
        corners: {
          radius: Number.isFinite(radius) ? Math.max(0, radius) : 0,
          smoothing: Math.min(
            1,
            Math.max(
              0,
              current.smoothing ?? (Number.isFinite(tokenSmoothing) ? tokenSmoothing : 0),
            ),
          ),
        },
        effects,
      };
      for (const property of Object.keys(hiddenStyles) as HiddenProperty[]) {
        if (
          property === "box-shadow" ? effects.shadow || effects.innerShadow : effects.innerBorder
        ) {
          saved.set(property, {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property),
          });
          // Keep border widths/layout; Lisse's autoEffects instead sets border:0.
          element.style.setProperty(property, hiddenStyles[property], "important");
        }
      }
      element.style.setProperty("transition", transition, transitionPriority);
      observer?.takeRecords();
      setAppearance((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    const onInteraction = (event: Event) => {
      if (event.type === "transitionend" || event.type === "animationend") {
        if (event.target !== element) return;
      } else if (event.type === "pointerover" || event.type === "pointerout") {
        const related = (event as PointerEvent).relatedTarget;
        if (related instanceof view.Node && element.contains(related)) return;
      }
      sync();
    };
    const events = [
      "pointerover",
      "pointerout",
      "focusin",
      "focusout",
      "transitionend",
      "animationend",
    ];
    const cleanup = () => {
      observer?.disconnect();
      resize?.disconnect();
      for (const event of events) element.removeEventListener(event, onInteraction);
      view.removeEventListener("resize", sync);
      scheme?.removeEventListener?.("change", sync);
      syncRef.current = null;
      restore();
    };
    try {
      syncRef.current = sync;
      observer?.observe(element, { attributes: true });
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        observer?.observe(ancestor, { attributes: true, attributeFilter: ["class", "style"] });
      }
      for (const event of events) element.addEventListener(event, onInteraction);
      view.addEventListener("resize", sync);
      scheme?.addEventListener?.("change", sync);
      resize?.observe(element);
      sync();
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [ref]);

  useIsomorphicLayoutEffect(() => {
    syncRef.current?.();
  });
  return appearance;
}
