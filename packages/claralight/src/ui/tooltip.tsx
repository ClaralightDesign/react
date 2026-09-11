"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { type AnchoredSide, AnchoredSurface, themedNumber, useThemedNumber } from "@/lib/anchored";
import { cn } from "@/lib/utils";

export type TooltipProps = ComponentProps<typeof BaseTooltip.Root>;

/**
 * A tooltip and its trigger.
 *
 * `disableHoverablePopup` defaults to on, which Base UI does not: a ClaraLight
 * tooltip is inert, so there is no popup to hover and keeping one open while
 * the pointer travels towards it only delays the close. Pass `false` to get
 * Base UI's behaviour back — worth doing only alongside a `TooltipContent` that
 * has been made interactive.
 */
export function Tooltip({ disableHoverablePopup = true, ...props }: TooltipProps) {
  return <BaseTooltip.Root disableHoverablePopup={disableHoverablePopup} {...props} />;
}

/** Re-exported unstyled, for building something other than the default content. */
export const TooltipPortal: typeof BaseTooltip.Portal = BaseTooltip.Portal;
export const TooltipPositioner: typeof BaseTooltip.Positioner = BaseTooltip.Positioner;
export const TooltipPopup: typeof BaseTooltip.Popup = BaseTooltip.Popup;
export const TooltipArrow: typeof BaseTooltip.Arrow = BaseTooltip.Arrow;

export type TooltipProviderProps = ComponentProps<typeof BaseTooltip.Provider>;

/**
 * Shares one dwell across a group of tooltips: once any of them has been shown,
 * the next opens instantly until `timeout` has passed.
 *
 * Worth wiring up even for a single tooltip — scanning a toolbar otherwise
 * means waiting out the dwell at every control.
 *
 * `timeout` reads `--cl-tooltip-grace` from the document, not from an element:
 * the provider renders no DOM of its own, and a grace period is a property of
 * the whole document's pointer, not of one subtree's theme.
 */
export function TooltipProvider({ timeout, ...props }: TooltipProviderProps) {
  // Not a ref onto anything rendered here — the provider renders nothing. It
  // reuses the reader's shape to keep the read in a layout effect rather than
  // in render, where it would force a synchronous layout on every pass.
  const root = useRef<Element | null>(
    typeof document === "undefined" ? null : document.documentElement,
  );
  const grace = useThemedNumber(root, "--cl-tooltip-grace");
  return <BaseTooltip.Provider timeout={timeout ?? grace} {...props} />;
}

export type TooltipTriggerProps = Omit<ComponentProps<typeof BaseTooltip.Trigger>, "className"> & {
  className?: string;
};

/**
 * Hover and keyboard focus reveal the tooltip; Base UI owns both, along with
 * dismissing it on Escape.
 *
 * There is deliberately no touch behaviour. A tooltip that needs a long press
 * to read is a tooltip nobody reads — on touch, put the information in the
 * interface or use a `Popover`.
 *
 * The dwell comes from `--cl-tooltip-delay` on the trigger's own cascade, so a
 * scoped override applies to the controls inside it.
 */
export function TooltipTrigger({ className, delay, closeDelay, ...props }: TooltipTriggerProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const dwell = useThemedNumber(ref, "--cl-tooltip-delay");
  const close = useThemedNumber(ref, "--cl-tooltip-close-delay");
  return (
    <BaseTooltip.Trigger
      ref={ref}
      delay={delay ?? dwell}
      closeDelay={closeDelay ?? close}
      className={className}
      {...props}
    />
  );
}

export type TooltipContentProps = Omit<ComponentProps<typeof BaseTooltip.Popup>, "className"> & {
  /** Applied to the clipped element: the frost, padding and text. */
  className?: string;
  /** Applied to the wrapper, which is what is positioned and animated. */
  wrapperClassName?: string;
  /** Preferred side of the trigger. Base UI flips when there is not enough room. */
  side?: AnchoredSide;
  align?: ComponentProps<typeof BaseTooltip.Positioner>["align"];
  /** Gap between the trigger and the surface, in px. Measured from the arrow's tip. */
  sideOffset?: number;
  /** Space kept clear of the viewport edge, in px. */
  collisionPadding?: number;
  /** Whether the surface points at its trigger. */
  arrow?: boolean;
  children?: ReactNode;
};

/**
 * The same anchored surface as `Popover`, one step quieter: a medium radius, a
 * plain outline rather than the strong one, and the label's own padding.
 *
 * A tooltip never takes the pointer — hovering it must not keep it open, and it
 * must not sit between the pointer and what it describes — so the whole
 * positioner is inert.
 */
export function TooltipContent({
  className,
  wrapperClassName,
  side = "top",
  align = "center",
  sideOffset,
  collisionPadding,
  arrow = true,
  children,
  ...props
}: TooltipContentProps) {
  const positionerRef = useRef<HTMLDivElement>(null);
  const margin = useThemedNumber(positionerRef, "--cl-anchor-margin");

  return (
    <BaseTooltip.Portal>
      <BaseTooltip.Positioner
        ref={positionerRef}
        side={side}
        align={align}
        sideOffset={
          sideOffset ?? (() => themedNumber(positionerRef.current, "--cl-anchor-gap") ?? 0)
        }
        collisionPadding={collisionPadding ?? margin}
        sticky
        className="pointer-events-none z-50 outline-none"
      >
        <AnchoredSurface
          asChild
          radius="medium"
          side={side}
          arrow={arrow}
          wrapperClassName={cn("w-fit", wrapperClassName)}
        >
          <BaseTooltip.Popup
            data-cl-slot="tooltip-content"
            className={cn(
              "cl-frost border-outline shadow-none",
              "font-sans text-callout text-foreground-secondary",
              "[--cl-anchored-padding-x:var(--cl-tooltip-padding-x)]",
              "[--cl-anchored-padding-y:var(--cl-tooltip-padding-y)]",
              className,
            )}
            {...props}
          >
            {children}
            {arrow ? (
              <BaseTooltip.Arrow data-cl-anchor-probe="" className="cl-anchor-probe" />
            ) : null}
          </BaseTooltip.Popup>
        </AnchoredSurface>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  );
}
