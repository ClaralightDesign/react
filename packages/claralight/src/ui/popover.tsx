"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { type AnchoredSide, AnchoredSurface, themedNumber, useThemedNumber } from "@/lib/anchored";
import { cn } from "@/lib/utils";

export const Popover: typeof BasePopover.Root = BasePopover.Root;

/** Re-exported unstyled, for building something other than the default content. */
export const PopoverPortal: typeof BasePopover.Portal = BasePopover.Portal;
export const PopoverPositioner: typeof BasePopover.Positioner = BasePopover.Positioner;
export const PopoverPopup: typeof BasePopover.Popup = BasePopover.Popup;
export const PopoverArrow: typeof BasePopover.Arrow = BasePopover.Arrow;
export const PopoverBackdrop: typeof BasePopover.Backdrop = BasePopover.Backdrop;

export type PopoverTriggerProps = Omit<ComponentProps<typeof BasePopover.Trigger>, "className"> & {
  className?: string;
};

export function PopoverTrigger({ className, ...props }: PopoverTriggerProps) {
  return <BasePopover.Trigger className={className} {...props} />;
}

export type PopoverContentProps = Omit<ComponentProps<typeof BasePopover.Popup>, "className"> & {
  /** Applied to the clipped element: the frost, padding and text. */
  className?: string;
  /** Applied to the wrapper, which is what is positioned and animated. */
  wrapperClassName?: string;
  /** Preferred side of the trigger. Base UI flips when there is not enough room. */
  side?: AnchoredSide;
  align?: ComponentProps<typeof BasePopover.Positioner>["align"];
  /** Gap between the trigger and the surface, in px. Measured from the arrow's tip. */
  sideOffset?: number;
  /** Space kept clear of the viewport edge, in px. */
  collisionPadding?: number;
  /** Whether the surface points at its trigger. */
  arrow?: boolean;
  children?: ReactNode;
};

/**
 * Portal, positioner and the pointing frosted surface, in the composition
 * everyone actually wants.
 *
 * `top` is the default side because that is ClaraLight's, not Base UI's — a
 * popover belongs above the control that opened it, so the control stays
 * visible under the reader's hand on touch.
 *
 * The arrow is part of the surface rather than an element beside it, so the
 * `Arrow` rendered here paints nothing: Floating UI solves and clamps its
 * position, and `AnchoredSurface` reads that back to splice the tail into the
 * surface's own path. See `src/lib/anchored.tsx`.
 *
 * The entrance grows the surface out of its own tail rather than from Base UI's
 * `--transform-origin`, which is the anchor's edge and therefore sits in the
 * gap *outside* the surface. `AnchoredSurface` sets the origin from the tail it
 * measured, and carries `.cl-anchored-root`, whose scale starts at zero instead
 * of at a dialog's 95% nudge. `sticky` keeps the surface on screen once its
 * trigger has been scrolled out of view, instead of letting it leave with it.
 */
export function PopoverContent({
  className,
  wrapperClassName,
  side = "top",
  align = "center",
  sideOffset,
  collisionPadding,
  arrow = true,
  children,
  ...props
}: PopoverContentProps) {
  const positionerRef = useRef<HTMLDivElement>(null);
  const margin = useThemedNumber(positionerRef, "--cl-anchor-margin");

  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        ref={positionerRef}
        side={side}
        align={align}
        sideOffset={
          sideOffset ?? (() => themedNumber(positionerRef.current, "--cl-anchor-gap") ?? 0)
        }
        collisionPadding={collisionPadding ?? margin}
        sticky
        className="z-50 outline-none"
      >
        <AnchoredSurface
          asChild
          radius="panel"
          side={side}
          arrow={arrow}
          wrapperClassName={cn("w-fit", wrapperClassName)}
        >
          <BasePopover.Popup
            data-cl-slot="popover-content"
            className={cn(
              "cl-frost shadow-none font-sans text-foreground",
              "[--cl-anchored-padding-x:var(--cl-popover-padding)]",
              "[--cl-anchored-padding-y:var(--cl-popover-padding)]",
              className,
            )}
            {...props}
          >
            {children}
            {arrow ? (
              <BasePopover.Arrow data-cl-anchor-probe="" className="cl-anchor-probe" />
            ) : null}
          </BasePopover.Popup>
        </AnchoredSurface>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

export type PopoverTitleProps = Omit<ComponentProps<typeof BasePopover.Title>, "className"> & {
  className?: string;
};

export function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <BasePopover.Title
      data-cl-slot="popover-title"
      className={cn("text-callout text-foreground", className)}
      {...props}
    />
  );
}

export type PopoverDescriptionProps = Omit<
  ComponentProps<typeof BasePopover.Description>,
  "className"
> & { className?: string };

export function PopoverDescription({ className, ...props }: PopoverDescriptionProps) {
  return (
    <BasePopover.Description
      data-cl-slot="popover-description"
      className={cn("text-caption text-foreground-tertiary", className)}
      {...props}
    />
  );
}

export type PopoverCloseProps = Omit<ComponentProps<typeof BasePopover.Close>, "className"> & {
  className?: string;
};

export function PopoverClose({ className, ...props }: PopoverCloseProps) {
  return <BasePopover.Close className={className} {...props} />;
}
