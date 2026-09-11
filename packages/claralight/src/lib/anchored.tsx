"use client";

import { type BorderConfig, generatePath, getLayoutSize, parseBorder } from "@lisse/core";
import {
  type ComponentProps,
  type CSSProperties,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { composeRefs, type RadiusToken } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * ClaraLight's anchored overlay surface — the shape behind `Popover` and
 * `Tooltip`.
 *
 * ## Why this is not `Squircle`
 *
 * A ClaraLight overlay points at its anchor, and the arrow is **part of the
 * surface**, not a second element parked against its edge. That is forced by
 * the design language rather than chosen for elegance: the frost fill is
 * translucent, so two overlapping elements composite their alpha into a
 * visible dark seam, and the 1px outline of the body would run straight across
 * the arrow's mouth. Both are plainly visible at rest, not just in motion.
 *
 * So the body and the tail are a single closed path. `Squircle` cannot express
 * that — Lisse's API takes corner options, with no way to hand it a path — so
 * this primitive owns the same three jobs `Squircle` delegates to Lisse:
 *
 *   clip-path   the fused path, which is also what clips the backdrop blur
 *   the outline an SVG stroke over the same path, because `clip-path` crops
 *               `border` (and `outline`) to nothing
 *   sync        re-measure when the surface resizes, flips side, or the anchor
 *               moves the tail
 *
 * It deliberately does **not** render a shadow. Anchored overlays in ClaraLight
 * sit on their outline and their blur alone.
 *
 * ## Why the body still comes from Lisse
 *
 * `generatePath` emits the Figma smoothing construction, which is the whole
 * argument in `squircle.tsx` for not using CSS `corner-shape`. Reimplementing
 * it here would fork the corner geometry of the design system, so the tail is
 * spliced into Lisse's own output instead: its straight edges are discrete
 * absolute `L` commands, which makes the splice an edit rather than a boolean
 * union.
 */

/**
 * The physical side of the anchor a surface sits on.
 *
 * Base UI also accepts the logical `inline-start` / `inline-end`, which are
 * deliberately not forwarded: with a physical side in, Base UI's resolved side
 * (and therefore `data-side`, which drives both the tail and the padding) is
 * guaranteed to be one of these four, so the geometry never has to resolve
 * writing direction to know which edge the tail belongs on.
 */
export type AnchoredSide = "top" | "bottom" | "left" | "right";

/** The tail sits on the edge facing the anchor — opposite the resolved side. */
const OPPOSITE: Record<AnchoredSide, AnchoredSide> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** Direction of travel along each edge, following the generated path's winding. */
const ALONG: Record<AnchoredSide, Point> = {
  top: { x: 1, y: 0 },
  right: { x: 0, y: 1 },
  bottom: { x: -1, y: 0 },
  left: { x: 0, y: -1 },
};

/** Outward normal of each edge. */
const OUTWARD: Record<AnchoredSide, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

interface Point {
  x: number;
  y: number;
}

/*
 * Tail control points, as fractions of the tail's half-width and extent.
 *
 * Two cubic segments per half keep the join with the body G2 continuous, so the
 * tail grows out of the edge instead of being stuck onto it. The compact
 * `0.84` body handle controls the root rounding; the shoulder and mid controls
 * are then *derived* so that join stays C2, and mirroring preserves tangent and
 * curvature at the rounded tip, whose `0.225` handle gives a tip radius of
 * about `0.446 * extent` at the 24x7 tail ClaraLight ships.
 *
 * These are curve construction, not design values: the tail's actual size is
 * `--cl-arrow-width` and `--cl-arrow-extent`.
 */
const TAIL_BODY_CONTROL = -0.84;
const TAIL_MID = -0.5;
const TAIL_TIP_CONTROL = -0.225;
const TAIL_SHOULDER_CONTROL = (4 * TAIL_MID + TAIL_BODY_CONTROL - TAIL_TIP_CONTROL) / 4;
const TAIL_MID_CONTROL = 2 * TAIL_MID - TAIL_SHOULDER_CONTROL;

/** Sub-pixel slack when deciding whether a point sits on an edge. */
const EPSILON = 0.01;

const round = (value: number) => Number(value.toFixed(4));
const format = (point: Point) => `${round(point.x)} ${round(point.y)}`;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface SurfaceGeometry {
  /** Border box of the whole surface, tail included. */
  width: number;
  height: number;
  /** Side of the anchor the surface was placed on. */
  side: AnchoredSide;
  radius: number;
  smoothing: number;
  /** Whether to splice the tail in at all. */
  arrow: boolean;
  /** How far the tail reaches past the body, and its full base width. */
  extent: number;
  arrowWidth: number;
  /** Tail centre along the tail's edge, from the surface's own origin. */
  center: number;
}

export interface SurfaceOutline {
  /** The `clip-path` value: the surface's whole filled region. */
  clip: string;
  /**
   * The subpaths to stroke. One when the tail is part of the body's own
   * outline; two when the surface is a union, in which case each is stroked
   * clipped to the outside of the other so the shared join is never drawn.
   */
  outline: string[];
  /** Where the surface grows from: the tail's tip, or the anchored edge. */
  origin: Point;
}

/**
 * The surface's filled region and the strokes that trace its boundary.
 *
 * The tail is spliced into the body's own path whenever the anchored edge has
 * a straight run long enough to hold its base. That is the case for every
 * top and bottom overlay and for tall ones on the left or right, and it is the
 * better construction: one continuous outline, stroked in one pass.
 *
 * A short edge has no straight run at all — the corners meet in the middle of
 * it — and no amount of splicing can put a 24px base on it. There the surface
 * becomes the union of the body and a tail whose base sinks below the body's
 * outline, which is what Flutter draws too. The `clip-path` unions them by
 * winding, and the two strokes are clipped against each other.
 */
export function surfacePath(geometry: SurfaceGeometry): SurfaceOutline {
  const edge = OPPOSITE[geometry.side];
  const vertical = edge === "left" || edge === "right";
  const inset = geometry.arrow ? geometry.extent : 0;
  const bodyWidth = Math.max(0, geometry.width - (vertical ? inset : 0));
  const bodyHeight = Math.max(0, geometry.height - (vertical ? 0 : inset));
  // The body is pushed away from whichever edge the tail occupies.
  const offset: Point = { x: edge === "left" ? inset : 0, y: edge === "top" ? inset : 0 };
  const body = generatePath(bodyWidth, bodyHeight, {
    radius: geometry.radius,
    smoothing: geometry.smoothing,
  });
  const span = vertical ? bodyHeight : bodyWidth;
  const depth = vertical ? bodyWidth : bodyHeight;

  if (!geometry.arrow || span <= 0 || depth <= 0) {
    const only = translate(body, offset);
    return { clip: only, outline: [only], origin: edgeOrigin(edge, geometry, span / 2) };
  }

  // Lisse hands each corner a budget of at most half the edge, so the corner
  // consumes `corner` of this edge and the straight run is whatever is left.
  const corner = Math.min((1 + geometry.smoothing) * geometry.radius, span / 2);
  const run = Math.max(0, span - 2 * corner);
  const halfWidth = fitTail(geometry.arrowWidth / 2, geometry.extent, span, corner, run);
  // Keep the tail clear of the corners, or centre it when the body is too
  // small to hold it anywhere else.
  const minimum = geometry.radius + halfWidth + 1;
  const maximum = span - minimum;
  const center = maximum < minimum ? span / 2 : clamp(geometry.center, minimum, maximum);
  const origin = edgeOrigin(edge, geometry, center);

  if (run >= geometry.arrowWidth) {
    const spliced = translate(body, offset, {
      edge,
      tail: tail(edge, center, halfWidth, 0, geometry.extent, bodyWidth, bodyHeight, offset, false),
      width: bodyWidth,
      height: bodyHeight,
    });
    return { clip: spliced, outline: [spliced], origin };
  }

  // No straight run: sink the base to where the body's outline actually is, so
  // the tail's sides cross it instead of stopping short and leaving a step.
  const sink = Math.min(
    depth / 2,
    Math.max(sunkBase(center - halfWidth, corner), sunkBase(span - center - halfWidth, corner)) + 1,
  );
  if (halfWidth <= sink) {
    const only = translate(body, offset);
    return { clip: only, outline: [only], origin };
  }
  const bodyPath = translate(body, offset);
  const tailPath = tail(
    edge,
    center,
    halfWidth,
    -sink,
    geometry.extent,
    bodyWidth,
    bodyHeight,
    offset,
    true,
  );
  return { clip: `${bodyPath} ${tailPath}`, outline: [bodyPath, tailPath], origin };
}

/**
 * The widest half-tail this edge can carry.
 *
 * A tail wider than the edge's straight run has to sit partly on the corners,
 * where the body's outline curves away beneath it — so the wider it gets, the
 * deeper it has to sink and the less of it stays above the surface. Rather than
 * bury a full-width tail and leave only its tip showing, narrow it until it
 * sinks by no more than a quarter of its own height, which keeps the shape
 * ClaraLight draws and simply scales it to the surface.
 */
function fitTail(
  halfWidth: number,
  extent: number,
  span: number,
  corner: number,
  run: number,
): number {
  if (run >= halfWidth * 2) return halfWidth;
  const budget = extent / 4;
  // Inverse of `sunkBase`: how far into the corner a base end may reach before
  // the outline has dropped further than the budget allows.
  const reach = Math.sqrt(Math.max(0, 2 * corner * budget - budget * budget));
  return Math.max(0, Math.min(halfWidth, Math.max(0, span / 2 - corner) + reach));
}

/**
 * How deep the body's outline lies at a base end that has run `distance` past
 * the start of the edge, approximating the corner as a circle of its own
 * tangency length — exact at both ends of the corner and within a fraction of
 * a pixel between them, which is all the join needs.
 */
function sunkBase(distance: number, corner: number): number {
  if (distance >= corner) return 0;
  const into = clamp(corner - distance, 0, corner);
  return corner - Math.sqrt(Math.max(0, corner * corner - into * into));
}

/** The tail's tip, in the surface's own coordinates: what the entrance grows from. */
function edgeOrigin(edge: AnchoredSide, geometry: SurfaceGeometry, center: number): Point {
  switch (edge) {
    case "top":
      return { x: center, y: 0 };
    case "bottom":
      return { x: center, y: geometry.height };
    case "left":
      return { x: 0, y: center };
    case "right":
      return { x: geometry.width, y: center };
  }
}

/**
 * The tail, entering and leaving along the edge's own direction of travel so it
 * can be dropped straight into the body's path, or closed into a subpath of its
 * own when the surface is a union.
 *
 * `base` and `tip` are the tail's two ends measured outwards from the body's
 * edge, so a negative base is one that starts below the surface it grows from.
 */
function tail(
  edge: AnchoredSide,
  center: number,
  halfWidth: number,
  base: number,
  tip: number,
  bodyWidth: number,
  bodyHeight: number,
  offset: Point,
  closed: boolean,
): string {
  const along = ALONG[edge];
  const outward = OUTWARD[edge];
  const start: Point = {
    x: (edge === "right" ? bodyWidth : edge === "left" ? 0 : center) + offset.x,
    y: (edge === "bottom" ? bodyHeight : edge === "top" ? 0 : center) + offset.y,
  };
  /** `cross` runs along the edge from the tail's centre, `out` from base to tip. */
  const point = (cross: number, out: number): Point => {
    const distance = base + out * (tip - base);
    return {
      x: start.x + along.x * cross * halfWidth + outward.x * distance,
      y: start.y + along.y * cross * halfWidth + outward.y * distance,
    };
  };
  const curve = (c1: Point, c2: Point, end: Point) =>
    `C ${format(c1)} ${format(c2)} ${format(end)}`;

  return [
    `${closed ? "M" : "L"} ${format(point(-1, 0))}`,
    curve(point(TAIL_BODY_CONTROL, 0), point(TAIL_SHOULDER_CONTROL, 0), point(TAIL_MID, 0.25)),
    curve(point(TAIL_MID_CONTROL, 0.5), point(TAIL_TIP_CONTROL, 1), point(0, 1)),
    curve(point(-TAIL_TIP_CONTROL, 1), point(-TAIL_MID_CONTROL, 0.5), point(-TAIL_MID, 0.25)),
    curve(point(-TAIL_SHOULDER_CONTROL, 0), point(-TAIL_BODY_CONTROL, 0), point(1, 0)),
    ...(closed ? ["Z"] : []),
  ].join(" ");
}

interface Splice {
  edge: AnchoredSide;
  tail: string;
  width: number;
  height: number;
}

/**
 * Move the generated body into place and, when asked, insert the tail.
 *
 * Only `M` and `L` are absolute in Lisse's output; corners are relative `c` and
 * `a`, so translating is a matter of rewriting two command types. The tail
 * replaces the one non-degenerate `L` that runs along the target edge — the
 * generator emits a zero-length `L` after each corner as well, which is why
 * length is part of the test rather than position alone.
 */
function translate(path: string, offset: Point, splice?: Splice): string {
  const commands = path.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
  const output: string[] = [];
  let current: Point = { x: 0, y: 0 };
  let inserted = false;

  for (const command of commands) {
    const type = command[0];
    const numbers = (command.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (type === "M" || type === "L") {
      const end: Point = { x: numbers[0] ?? 0, y: numbers[1] ?? 0 };
      if (
        splice &&
        !inserted &&
        type === "L" &&
        onEdge(current, splice) &&
        onEdge(end, splice) &&
        (Math.abs(end.x - current.x) > EPSILON || Math.abs(end.y - current.y) > EPSILON)
      ) {
        output.push(splice.tail);
        inserted = true;
      }
      output.push(`${type} ${format({ x: end.x + offset.x, y: end.y + offset.y })}`);
      current = end;
    } else if (type === "Z" || type === "z") {
      output.push("Z");
    } else {
      // Relative corner segments: unaffected by the translation, but they still
      // advance the pen, and every one of them ends on its last coordinate pair.
      output.push(command.trim());
      current = {
        x: current.x + (numbers.at(-2) ?? 0),
        y: current.y + (numbers.at(-1) ?? 0),
      };
    }
  }
  return output.join(" ");
}

function onEdge(point: Point, splice: Splice): boolean {
  switch (splice.edge) {
    case "top":
      return Math.abs(point.y) < EPSILON;
    case "bottom":
      return Math.abs(point.y - splice.height) < EPSILON;
    case "left":
      return Math.abs(point.x) < EPSILON;
    case "right":
      return Math.abs(point.x - splice.width) < EPSILON;
  }
}

/* ---------------------------------------------------------------------------
 * The component
 * ------------------------------------------------------------------------- */

export interface AnchoredSurfaceProps extends Omit<ComponentProps<"div">, "children"> {
  /** Which `--radius-*` token shapes the body's corners. */
  radius: RadiusToken;
  /**
   * Preferred side, used until Base UI reports the side it actually resolved
   * on `data-side`. Only the fallback: a flip updates the tail on its own.
   */
  side: AnchoredSide;
  /** Whether the surface points at its anchor. */
  arrow?: boolean;
  /** Figma's `xi`; defaults to `--cl-corner-smoothing`, as in `Squircle`. */
  smoothing?: number;
  /** Classes for the wrapper: placement, transform, and the entrance. */
  wrapperClassName?: string;
  /** Classes for the shape itself: fill, border, padding, text. */
  className?: string;
  /** Whether the fused tail follows a new trigger on an interruptible track. */
  tailMotion?: "none" | "fast";
  /**
   * Merge onto a single child rather than rendering a `div`. Needed for the
   * same reason as in `Squircle`: the clipped element is a Base UI part that
   * owns its own tag and behaviour.
   */
  asChild?: boolean;
  children?: ReactNode;
}

interface Appearance {
  clip: string;
  outline: string[];
  origin: Point | null;
  width: number;
  height: number;
  side: AnchoredSide;
  tailCenter: number | null;
  border?: BorderConfig;
}

/** Big enough to cover any surface, so `evenodd` leaves everything outside a subpath. */
const COVER = "M -9999 -9999 H 9999 V 9999 H -9999 Z";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const EMPTY: Appearance = {
  clip: "",
  outline: [],
  origin: null,
  width: 0,
  height: 0,
  side: "top",
  tailCenter: null,
};

export function AnchoredSurface({
  radius,
  side,
  arrow = true,
  smoothing,
  wrapperClassName,
  className,
  asChild = false,
  children,
  ref: forwardedRef,
  style,
  tailMotion = "none",
  ...props
}: AnchoredSurfaceProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const child = asChild ? getShapeChild(children) : undefined;
  const childProps = child?.props as ComponentProps<"div"> | undefined;
  const mergedRef = useMemo(
    () => composeRefs(setElement, forwardedRef, childProps?.ref),
    [forwardedRef, childProps?.ref],
  );
  const mergedStyle = { ...style, ...childProps?.style };
  const appearance = useAppearance(element, { radius, side, arrow, smoothing, tailMotion });
  // React's own ids are not valid in a fragment reference.
  const clipId = `cl-anchored-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const shaped = appearance.clip.length > 0;

  const shapeProps = {
    ...props,
    ref: mergedRef,
    "data-cl-anchored": radius,
    style: {
      ...mergedStyle,
      // CSS intersects `border-radius` with `clip-path`, so the SSR fallback
      // has to go once the real shape lands.
      borderRadius: shaped ? undefined : (mergedStyle.borderRadius ?? `var(--radius-${radius})`),
      clipPath: shaped ? `path("${appearance.clip}")` : undefined,
    } as CSSProperties,
    className: cn("cl-anchored", arrow && "cl-anchored-arrow", className, childProps?.className),
  };
  const border = appearance.border;
  // A gradient border has no meaning for a 1px outline, and Lisse only reports
  // one when the author asked for it; a plain colour is the whole contract here.
  const stroke = shaped && border && typeof border.color === "string" ? border : undefined;

  return (
    /*
     * `.cl-anchored-root` is the entrance — the surface grows out of its tail,
     * which is the one point that does not move while it plays. Base UI's own
     * `--transform-origin` cannot say that: it is the anchor's edge, so it sits
     * in the gap *outside* the surface, and its cross-axis position is the
     * anchor's centre rather than the arrow's clamped one.
     *
     * The origin below is therefore the tail this component measured, and the
     * two have to agree: the entrance scales about the point the path draws, or
     * the surface would grow sideways out of a tail that is somewhere else.
     */
    <div
      className={cn("cl-anchored-root relative", wrapperClassName)}
      style={
        appearance.origin
          ? { transformOrigin: `${appearance.origin.x}px ${appearance.origin.y}px` }
          : undefined
      }
    >
      {child ? cloneElement(child, shapeProps) : <div {...shapeProps}>{children}</div>}
      {/*
        The outline is a sibling, not a border: `clip-path` crops the element's
        own border paint, and it has to trace the tail as well. Drawn at twice
        the authored width and clipped back to the surface, so the stroke lands
        wholly inside it — the same inner-border construction Lisse uses.

        When the surface is a union, each subpath is stroked clipped to the
        outside of the other, so the boundary they share — the tail's base,
        buried under the body — is never painted.
      */}
      {stroke ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0"
          width={appearance.width}
          height={appearance.height}
        >
          <defs>
            <clipPath id={clipId}>
              <path d={appearance.clip} />
            </clipPath>
            {appearance.outline.length > 1
              ? appearance.outline.map((_, index) => (
                  <clipPath
                    // biome-ignore lint/suspicious/noArrayIndexKey: the two subpaths are positional
                    key={index}
                    id={`${clipId}-${index}`}
                  >
                    <path
                      clipRule="evenodd"
                      d={`${COVER} ${appearance.outline[index === 0 ? 1 : 0]}`}
                    />
                  </clipPath>
                ))
              : null}
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {appearance.outline.map((d, index) => (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: the two subpaths are positional
                key={index}
                d={d}
                fill="none"
                stroke={stroke.color as string}
                strokeOpacity={stroke.opacity}
                strokeWidth={stroke.width * 2}
                clipPath={appearance.outline.length > 1 ? `url(#${clipId}-${index})` : undefined}
              />
            ))}
          </g>
        </svg>
      ) : null}
    </div>
  );
}

function getShapeChild(child: ReactNode) {
  if (!isValidElement<ComponentProps<"div">>(child) || child.type === Fragment) {
    throw new Error("AnchoredSurface: `asChild` expects exactly one non-Fragment React element.");
  }
  return child;
}

const BORDER_SIDES = [
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
] as const;

interface Inputs {
  radius: RadiusToken;
  side: AnchoredSide;
  arrow: boolean;
  smoothing: number | undefined;
  tailMotion: "none" | "fast";
}

/**
 * Measure the surface and keep the fused path in sync.
 *
 * Every input is read from the shape's own computed style rather than from
 * `documentElement`, so a locally scoped theme, a `rem` radius or an inline
 * token override all work — the same reasoning as `Squircle`'s reader.
 *
 * There is no frame polling at rest. Three things move the tail, and each one
 * has a signal: the surface resizing (`ResizeObserver`), Base UI flipping the
 * side (`data-side`), and Floating UI re-solving the arrow offset, which it
 * writes as inline `left`/`top` on the probe. The optional motion track runs only
 * for the interval after that probe changes.
 */
function useAppearance(element: HTMLDivElement | null, inputs: Inputs): Appearance {
  const [appearance, setAppearance] = useState<Appearance>(EMPTY);
  const latest = useRef(inputs);
  latest.current = inputs;
  const appearanceRef = useRef(EMPTY);
  const syncRef = useRef<(() => void) | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!element) return;
    const view = element.ownerDocument.defaultView;
    if (!view) return;
    const saved = new Map<string, { value: string; priority: string }>();
    let animationFrame: number | null = null;
    let animationId = 0;
    let target: { geometry: SurfaceGeometry; border?: BorderConfig } | null = null;

    const restore = () => {
      for (const [property, source] of saved) {
        if (element.style.getPropertyValue(property) === "transparent") {
          element.style.setProperty(property, source.value, source.priority);
        }
      }
      saved.clear();
    };

    const commit = (next: Appearance) => {
      appearanceRef.current = next;
      setAppearance((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };

    const cancelTailMotion = () => {
      animationId += 1;
      if (animationFrame !== null) {
        view.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const buildAppearance = (
      geometry: SurfaceGeometry,
      border: BorderConfig | undefined,
      center = geometry.center,
    ): Appearance => {
      const surface =
        geometry.width > 0 && geometry.height > 0
          ? surfacePath({ ...geometry, center })
          : undefined;
      return {
        width: geometry.width,
        height: geometry.height,
        side: geometry.side,
        tailCenter: geometry.arrow ? center : null,
        border,
        clip: surface?.clip ?? "",
        outline: surface?.outline ?? [],
        origin: surface?.origin ?? null,
      };
    };

    const startTailMotion = (from: number, to: number) => {
      cancelTailMotion();
      const duration = themedNumber(element, "--cl-duration-tooltip-morph") ?? 180;
      const start = view.performance.now();
      const id = animationId;

      const frame = (now: number) => {
        if (id !== animationId) return;
        const progress = Math.min(1, (now - start) / Math.max(1, duration));
        const eased = 1 - (1 - progress) ** 3;
        const value = from + (to - from) * eased;
        const currentTarget = target;
        if (currentTarget) {
          commit(buildAppearance(currentTarget.geometry, currentTarget.border, value));
        }
        if (progress < 1) {
          animationFrame = view.requestAnimationFrame(frame);
        } else {
          animationFrame = null;
          if (currentTarget) {
            commit(buildAppearance(currentTarget.geometry, currentTarget.border));
          }
        }
      };

      animationFrame = view.requestAnimationFrame(frame);
    };

    const sync = (animateTail = false) => {
      const { radius: token, side, arrow, smoothing, tailMotion } = latest.current;
      // Sample the authored border, not the transparent mask we leave behind.
      restore();
      const computed = view.getComputedStyle(element);
      const { width, height } = getLayoutSize(element, computed);
      const border = parseBorder(element, computed);
      const number = (name: string) => Number.parseFloat(computed.getPropertyValue(name));

      // Let the browser resolve the radius token's units and inheritance.
      const previous = element.style.borderTopLeftRadius;
      element.style.borderTopLeftRadius = `var(--radius-${token})`;
      const radius = Number.parseFloat(computed.borderTopLeftRadius);
      element.style.borderTopLeftRadius = previous;

      const resolvedSide = readSide(element) ?? side;
      const tokenSmoothing = number("--cl-corner-smoothing");
      const extent = number("--cl-arrow-extent");
      const arrowWidth = number("--cl-arrow-width");
      const drawArrow = arrow && Number.isFinite(extent) && Number.isFinite(arrowWidth);
      const geometry: SurfaceGeometry = {
        width,
        height,
        side: resolvedSide,
        radius: Number.isFinite(radius) ? Math.max(0, radius) : 0,
        smoothing: clamp(smoothing ?? (Number.isFinite(tokenSmoothing) ? tokenSmoothing : 0), 0, 1),
        arrow: drawArrow,
        extent: drawArrow ? extent : 0,
        arrowWidth: drawArrow ? arrowWidth : 0,
        center: drawArrow ? tailCenter(element, resolvedSide, width, height) : 0,
      };
      target = { geometry, border };

      const current = appearanceRef.current;
      const reduceMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      const canAnimate =
        animateTail &&
        tailMotion === "fast" &&
        !reduceMotion &&
        geometry.arrow &&
        current.tailCenter !== null &&
        current.side === geometry.side &&
        Math.abs(current.tailCenter - geometry.center) > 0.01;

      if (canAnimate) {
        commit(buildAppearance(geometry, border, current.tailCenter as number));
        startTailMotion(current.tailCenter as number, geometry.center);
      } else {
        const keepPresentationCenter =
          animationFrame !== null &&
          geometry.arrow &&
          current.tailCenter !== null &&
          current.side === geometry.side;
        if (!keepPresentationCenter) {
          cancelTailMotion();
        }
        commit(
          buildAppearance(
            geometry,
            border,
            keepPresentationCenter ? (current.tailCenter as number) : geometry.center,
          ),
        );
      }

      if (border) {
        for (const property of BORDER_SIDES) {
          saved.set(property, {
            value: element.style.getPropertyValue(property),
            priority: element.style.getPropertyPriority(property),
          });
          // Keep the border's width, which is what holds the content inset.
          element.style.setProperty(property, "transparent", "important");
        }
      }
      observer.takeRecords();
    };

    const observer = new view.MutationObserver(() => sync(true));
    const resize = new view.ResizeObserver(() => sync(false));
    const cleanup = () => {
      cancelTailMotion();
      observer.disconnect();
      resize.disconnect();
      syncRef.current = null;
      restore();
    };
    try {
      syncRef.current = () => sync(false);
      observer.observe(element, { attributes: true, attributeFilter: ["data-side"] });
      const probe = element.querySelector("[data-cl-anchor-probe]");
      if (probe) observer.observe(probe, { attributes: true, attributeFilter: ["style"] });
      resize.observe(element);
      sync(false);
      return cleanup;
    } catch (error) {
      cleanup();
      throw error;
    }
  }, [element, inputs.arrow, inputs.tailMotion]);

  useIsomorphicLayoutEffect(() => {
    syncRef.current?.();
  });
  return appearance;
}

/**
 * A token's leading number, in the unit the token was written in: px as px,
 * durations as milliseconds.
 *
 * Custom properties are substituted, not computed, so the unit comes back as it
 * was authored — and a `450ms` in the source is `.45s` in the build. A duration
 * therefore has to be converted rather than read at face value: 0.45 is a dwell
 * that has already elapsed, and Base UI counts in the same milliseconds the
 * token was written in.
 */
export function tokenNumber(value: string): number | undefined {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return undefined;
  return value.endsWith("ms") ? number : value.endsWith("s") ? number * 1000 : number;
}

/**
 * The leading number of a length or duration token, read from an element's own
 * cascade — a local theme, a scoped override or a `rem` value all resolve.
 */
export function themedNumber(
  element: Element | null | undefined,
  name: string,
): number | undefined {
  const view = element?.ownerDocument.defaultView;
  if (!element || !view) return undefined;
  return tokenNumber(view.getComputedStyle(element).getPropertyValue(name));
}

/**
 * `themedNumber` for the props Base UI cannot take as a callback.
 *
 * `sideOffset` accepts a function and is resolved during positioning, so it can
 * read the token inline; `collisionPadding` and the tooltip delays are plain
 * numbers, and reading them needs a mounted element. Running in a layout effect
 * keeps the correction ahead of paint, so a first pass on Base UI's own default
 * is never visible.
 */
export function useThemedNumber(
  ref: { current: Element | null },
  name: string,
): number | undefined {
  const [value, setValue] = useState<number>();
  useIsomorphicLayoutEffect(() => {
    const next = themedNumber(ref.current, name);
    setValue((current) => (current === next ? current : next));
  });
  return value;
}

function readSide(element: HTMLElement): AnchoredSide | undefined {
  const side = element.dataset.side;
  return side === "top" || side === "bottom" || side === "left" || side === "right"
    ? side
    : undefined;
}

/**
 * Where the tail meets the body, from the surface's own origin.
 *
 * Read off Base UI's arrow element, which Floating UI has already solved and
 * clamped against the anchor.
 *
 * Offset geometry rather than `getBoundingClientRect`, because this has to
 * survive the entrance. The wrapper scales from zero, so on the first frame
 * every rect inside it collapses to a point, and nothing can be recovered from
 * the ratio — a couple of rects at 0 measure a tail at the surface's left edge.
 * Offsets are layout space: a transform does not move them, and the measurement
 * is therefore right the first time instead of being right later, which is the
 * difference between a tail that follows the anchor and one that waits for the
 * next resize.
 *
 * An absolutely positioned box is placed from its containing block's *padding*
 * box, so a probe whose offset parent is the surface itself is short by that
 * surface's own border — and the path is drawn in border-box space. The surface
 * is the probe's containing block whenever it carries the frost, whose
 * `backdrop-filter` establishes one; the wrapper is the alternative, and it has
 * no insets of its own to correct for.
 */
function tailCenter(
  element: HTMLElement,
  side: AnchoredSide,
  width: number,
  height: number,
): number {
  const probe = element.querySelector<HTMLElement>("[data-cl-anchor-probe]");
  if (!probe) return (side === "left" || side === "right" ? height : width) / 2;
  const horizontal = side === "top" || side === "bottom";
  const border =
    probe.offsetParent === element ? (horizontal ? element.clientLeft : element.clientTop) : 0;
  return horizontal
    ? probe.offsetLeft + border + probe.offsetWidth / 2
    : probe.offsetTop + border + probe.offsetHeight / 2;
}
