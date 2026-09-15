"use client";

import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ComponentProps, ReactNode, Ref } from "react";
import { type RadiusToken, Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/** Axes the content can move in. */
export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

/** Visibility policy for one scrollbar. */
export type ScrollbarVisibility = "auto" | "always" | "hidden";

/**
 * How a side announces that there is more content behind it.
 *
 * `blur` is the full treatment: the content fades out toward the frame and
 * smears through the near-edge band, while the physical edge settles to the
 * surface fill. **It needs an opaque fill** — `bg-panel` or `bg-background`, not
 * `bg-control`, `bg-track` or `cl-frost`. The smooth-corner clip makes the
 * surface its own backdrop root, so the blur can only see the surface's own
 * fill and the scrolled content; over a translucent fill there is barely any
 * colour there to blur and the engine lifts it into a white halo instead. See
 * `scroll-area.css` for the measurements and why nothing else can be done
 * about it.
 *
 * `mask` keeps only the fade. It has none of that coupling — it is a
 * compositor-only effect that works over any fill — and it is the right choice
 * for a translucent surface, or for a scroll area already inside something
 * expensive. `none` leaves the edges hard.
 */
export type ScrollAreaEdge = "blur" | "mask" | "none";

/** Re-exported unstyled, for building something other than the default area. */
export const ScrollAreaRoot: typeof BaseScrollArea.Root = BaseScrollArea.Root;
export const ScrollAreaViewport: typeof BaseScrollArea.Viewport = BaseScrollArea.Viewport;
export const ScrollAreaContent: typeof BaseScrollArea.Content = BaseScrollArea.Content;
export const ScrollAreaScrollbar: typeof BaseScrollArea.Scrollbar = BaseScrollArea.Scrollbar;
export const ScrollAreaThumb: typeof BaseScrollArea.Thumb = BaseScrollArea.Thumb;
export const ScrollAreaCorner: typeof BaseScrollArea.Corner = BaseScrollArea.Corner;

const EDGES = {
  vertical: ["block-start", "block-end"],
  horizontal: ["inline-start", "inline-end"],
} as const;

/**
 * Three layers per edge, because a single `backdrop-filter` has one sigma for
 * its whole box and the effect needs sigma to fall off across the band. The
 * masks and the sigma ramp live in `scroll-area.css`; the count is here because
 * it is the one part the CSS cannot express on its own.
 */
function ScrollEdge({ edge }: { edge: (typeof EDGES)[keyof typeof EDGES][number] }) {
  return (
    <div data-cl-slot="scroll-area-edge" data-edge={edge} className="cl-scroll-edge" aria-hidden>
      <div className="cl-scroll-edge-layer" />
      <div className="cl-scroll-edge-layer" />
      <div className="cl-scroll-edge-layer" />
    </div>
  );
}

export interface ScrollAreaProps
  extends Omit<ComponentProps<typeof BaseScrollArea.Root>, "className" | "children"> {
  /**
   * Applied to the clipped element: fill, border, and **the area's size**.
   *
   * The size has to be here and it has to be definite. The viewport fills the
   * surface absolutely, so a surface left to size itself to its content has no
   * height at all — `className="h-64"`, not a bare `<ScrollArea>`.
   */
  className?: string;
  /**
   * Applied to the layout wrapper, which is the element the caller's grid or
   * flex lays out. Placement goes here — `col-span-2`, `flex-1` — and when the
   * placement is what decides the height, pair it with `className="h-full"` so
   * the surface inside still resolves to something definite.
   */
  wrapperClassName?: string;
  /** Applied to the scrolling element itself. */
  viewportClassName?: string;
  /**
   * Applied to the box that moves. This is where padding belongs: put it on
   * the surface instead and it stays pinned over the scrolling content, with
   * the edge effects fading a gap rather than the content.
   */
  contentClassName?: string;
  /**
   * Axes the content can move in.
   *
   * `both` matches the Flutter widget and leaves the content unconstrained on
   * each enabled axis, which is why the content box is `max-content` wide
   * whenever the inline axis can scroll: a horizontally scrollable child has to
   * be allowed to exceed the viewport before it has anything to scroll. Lock
   * the axis with `vertical` and the box is pinned to the viewport instead, so
   * the content wraps rather than running off an edge it cannot scroll to.
   */
  orientation?: ScrollAreaOrientation;
  /** How the sides announce content behind them. */
  edge?: ScrollAreaEdge;
  /** One policy for both bars, or one per axis. */
  scrollbars?: ScrollbarVisibility | { x?: ScrollbarVisibility; y?: ScrollbarVisibility };
  /** Which `--radius-*` token shapes the corners. */
  radius?: RadiusToken;
  /** Figma's `xi`; see `Squircle`. */
  smoothing?: number;
  /**
   * The scrolling element. This is the web's scroll controller — `scrollTo`,
   * `scrollTop` and `scrollIntoView` on a child all work through it — so there
   * is no separate controller object and no per-axis pairing to keep distinct.
   */
  viewportRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}

function resolveScrollbars(value: ScrollAreaProps["scrollbars"]) {
  if (value === undefined) return { x: "auto", y: "auto" } as const;
  if (typeof value === "string") return { x: value, y: value };
  return { x: value.x ?? "auto", y: value.y ?? "auto" };
}

/**
 * A ClaraLight viewport: content that scrolls, sides that dissolve into the
 * frame as more of it comes into range, and scrollbars that surface while you
 * are using them.
 *
 * Almost nothing here runs in React. Base UI reports the four overflow edges
 * both as booleans and as live pixel distances, and `scroll-area.css` drives
 * the mask straight off the distances — so the fade tracks the scroll position
 * exactly, with no animation, no timer and no re-render between the wheel and
 * the pixels. Scrolling only re-renders when an edge is genuinely crossed.
 *
 * Everything dimensional is a CSS variable rather than a prop, which is how the
 * per-side control the design asks for costs no API surface:
 *
 *     <ScrollArea className="[--cl-scroll-edge-block-end:0px]" />
 *
 * turns the bottom edge off, and scoping `--cl-scroll-blur` to one `[data-edge]`
 * gives that side its own sigma.
 */
export function ScrollArea({
  className,
  wrapperClassName,
  viewportClassName,
  contentClassName,
  orientation = "both",
  edge = "blur",
  scrollbars,
  radius = "medium",
  smoothing,
  viewportRef,
  children,
  ...props
}: ScrollAreaProps) {
  const visibility = resolveScrollbars(scrollbars);
  const vertical = orientation !== "horizontal";
  const horizontal = orientation !== "vertical";

  const activeEdges =
    edge === "blur"
      ? [...(vertical ? EDGES.vertical : []), ...(horizontal ? EDGES.horizontal : [])]
      : [];

  return (
    <Squircle asChild radius={radius} smoothing={smoothing} wrapperClassName={wrapperClassName}>
      <BaseScrollArea.Root
        data-cl-slot="scroll-area"
        className={cn("cl-scroll-area", className)}
        {...props}
      >
        <BaseScrollArea.Viewport
          ref={viewportRef}
          data-cl-slot="scroll-area-viewport"
          // `size-full` is load-bearing, not cosmetic. Base UI gives the
          // viewport `overflow: scroll` and nothing else, so left to itself it
          // is an auto-height block that grows to its content and therefore
          // never overflows: the area looks right, because the surface clips
          // it, and scrolls nowhere. The height has to come from the surface.
          className={cn(
            "size-full overscroll-contain",
            edge !== "none" && "cl-scroll-viewport",
            viewportClassName,
          )}
          // Base UI writes `overflow: scroll`; a locked axis is layered on top
          // of it rather than replacing it, so the element stays a scroller and
          // keeps reporting the other axis' overflow.
          style={
            vertical && horizontal
              ? undefined
              : vertical
                ? { overflowX: "hidden" }
                : { overflowY: "hidden" }
          }
        >
          <BaseScrollArea.Content
            data-cl-slot="scroll-area-content"
            className={contentClassName}
            // Base UI writes `min-width: fit-content` here inline, which no
            // class can outrank — and inside a scroll container that keyword
            // measures the content rather than the scrollport, so it is wrong
            // in both directions: a scrollable axis is still capped at the
            // viewport, and a locked axis is widened past it, where nothing can
            // reach it. Each axis wants the opposite.
            style={{ minWidth: horizontal ? "max-content" : 0 }}
          >
            {children}
          </BaseScrollArea.Content>
        </BaseScrollArea.Viewport>

        {activeEdges.map((side) => (
          <ScrollEdge key={side} edge={side} />
        ))}

        {vertical && visibility.y !== "hidden" && (
          <BaseScrollArea.Scrollbar
            orientation="vertical"
            data-cl-slot="scroll-area-scrollbar"
            data-cl-visibility={visibility.y}
            className="cl-scrollbar"
          >
            <BaseScrollArea.Thumb data-cl-slot="scroll-area-thumb" className="cl-scroll-thumb" />
          </BaseScrollArea.Scrollbar>
        )}

        {horizontal && visibility.x !== "hidden" && (
          <BaseScrollArea.Scrollbar
            orientation="horizontal"
            data-cl-slot="scroll-area-scrollbar"
            data-cl-visibility={visibility.x}
            className="cl-scrollbar"
          >
            <BaseScrollArea.Thumb data-cl-slot="scroll-area-thumb" className="cl-scroll-thumb" />
          </BaseScrollArea.Scrollbar>
        )}
      </BaseScrollArea.Root>
    </Squircle>
  );
}
