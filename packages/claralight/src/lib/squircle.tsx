"use client";

import { useSmoothCorners } from "@lisse/react";
import {
  type ComponentProps,
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactNode,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

/**
 * ClaraLight's smooth-corner primitive.
 *
 * ## Why this exists instead of `corner-shape`
 *
 * Every ClaraLight corner is a smooth corner, and the Flutter source gets it
 * from `RoundedSuperellipseBorder`. On the web there are two ways to draw that
 * and they are **different curve families that do not coincide**:
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

/**
 * Used only when there is no document to read from, i.e. during SSR.
 *
 * `useSmoothCorners` applies its clip-path in an effect, so nothing on the
 * server consumes this value; it exists so the hook receives a number rather
 * than `NaN`. `scripts/check-gallery.mjs` asserts these match theme.css so the
 * two cannot drift silently.
 */
export const RADIUS_FALLBACK: Record<RadiusToken, number> = {
  control: 8,
  medium: 12,
  panel: 18,
  sheet: 36,
  dialog: 36,
  capsule: 999,
};

/**
 * Reads `--radius-<token>` back out of the document.
 *
 * Lisse builds an SVG path from real pixel dimensions, while the design tokens
 * are CSS lengths. Reading the token keeps theme.css the single source of truth
 * instead of adding a second radius scale in JavaScript that can go stale — and
 * it means an application that retints `--radius-panel` gets rounded panels
 * without touching a component.
 */
function readRadius(token: RadiusToken): number {
  if (typeof document === "undefined") return RADIUS_FALLBACK[token];
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--radius-${token}`);
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : RADIUS_FALLBACK[token];
}

export interface SquircleProps extends Omit<ComponentProps<"div">, "style"> {
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
  smoothing = 0.6,
  wrapperClassName,
  ring = false,
  asChild = false,
  className,
  children,
  ...props
}: SquircleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const border = `var(--radius-${radius})`;

  useSmoothCorners(
    ref,
    { radius: readRadius(radius), smoothing },
    {
      wrapperRef,
      /*
       * Reads our Tailwind `border-*` and `shadow-*` declarations off the
       * element and re-renders them as SVG strokes and filters that trace the
       * squircle. It then strips the CSS so the clipped originals cannot show
       * through, and restores them on teardown.
       */
      autoEffects: true,
      /*
       * `clip-path` and `border-radius` intersect, so a `rounded-*` class left
       * on the clipped element squares the squircle back off. Passing the
       * fallback as an inline style lets Lisse clear it once the path lands,
       * which also gives first paint and SSR a correctly rounded box.
       */
      fallbackBorderRadius: border,
    },
  );

  /*
   * `clip-path` and `border-radius` intersect, so the fallback is an inline
   * style the hook can clear. It doubles as the SSR and first-paint radius.
   */
  const shapeProps = {
    ref,
    "data-cl-squircle": radius,
    style: { borderRadius: border },
    className,
    ...props,
  };

  return (
    <div
      ref={wrapperRef}
      style={{ "--cl-squircle-radius": border } as CSSProperties}
      className={cn(
        "relative",
        ring === true && "cl-squircle-root",
        ring === "field" && "cl-squircle-root cl-squircle-field",
        wrapperClassName,
      )}
    >
      {asChild ? mergeShapeOntoChild(children, shapeProps) : <div {...shapeProps}>{children}</div>}
    </div>
  );
}

/**
 * Applies the shape props to the caller's element instead of adding a wrapper
 * around it, merging rather than overwriting what that element already has.
 *
 * `cloneElement` is the right tool here and the reason `asChild` exists: the
 * child is already a fully-formed primitive with its own ref forwarding and
 * className merging, so the only correct move is to hand it one more set of
 * props and let it decide.
 */
function mergeShapeOntoChild(child: ReactNode, shapeProps: Record<string, unknown>): ReactNode {
  if (!isValidElement(child)) {
    throw new Error("Squircle: `asChild` expects exactly one React element as its child.");
  }
  const existing = child.props as { className?: string; style?: CSSProperties };
  return cloneElement(child, {
    ...shapeProps,
    className: cn(shapeProps.className as string | undefined, existing.className),
    style: { ...(shapeProps.style as CSSProperties), ...existing.style },
  } as never);
}
