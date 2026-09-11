"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { type ComponentProps, useRef } from "react";
import { Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * Inlined rather than pulled from an icon library: three glyphs is not worth a
 * dependency in a component consumers copy into their own project, and swapping
 * `lucide-react` in later is a one-line change per icon via `components.json`.
 */
function ChevronDownIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="m4 6.5 4 4 4-4" />
    </svg>
  );
}

function CheckIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export const Select: typeof BaseSelect.Root = BaseSelect.Root;

/** Re-exported unstyled, for building something other than the default content. */
export const SelectPortal: typeof BaseSelect.Portal = BaseSelect.Portal;
export const SelectPositioner: typeof BaseSelect.Positioner = BaseSelect.Positioner;
export const SelectPopup: typeof BaseSelect.Popup = BaseSelect.Popup;
export const SelectList: typeof BaseSelect.List = BaseSelect.List;

export type SelectTriggerProps = Omit<ComponentProps<typeof BaseSelect.Trigger>, "className"> & {
  className?: string;
  /** Applied to the wrapper, which is what a caller's layout sizes. */
  wrapperClassName?: string;
  /**
   * Shared control-height tokens. Defaults to `md` rather than
   * the button's `lg`, because a select is usually one control among several in
   * a dense row.
   */
  size?: "sm" | "md" | "lg";
};

const triggerSizes = {
  sm: "h-control-sm px-2 text-caption",
  md: "h-control-md px-3 text-callout",
  lg: "h-control-lg px-4 text-body",
} as const;

const pressScales = {
  sm: "[--cl-press-scale:var(--cl-press-scale-sm)]",
  md: "[--cl-press-scale:var(--cl-press-scale-md)]",
  lg: "[--cl-press-scale:var(--cl-press-scale-lg)]",
} as const;

export function SelectTrigger({
  className,
  wrapperClassName,
  size = "md",
  ...props
}: SelectTriggerProps) {
  return (
    <Squircle
      asChild
      radius="control"
      ring="field"
      wrapperClassName={cn("cl-press w-full", pressScales[size], wrapperClassName)}
    >
      <BaseSelect.Trigger
        data-cl-slot="select-trigger"
        className={cn(
          "group flex w-full items-center justify-between gap-2",
          "border border-outline bg-control text-left font-sans text-foreground",
          "hover:bg-control-highlight",
          "data-[popup-open]:bg-control-highlight",
          "data-[disabled]:pointer-events-none data-[disabled]:text-foreground-disabled",
          "data-[placeholder]:text-foreground-hint",
          triggerSizes[size],
          className,
        )}
        {...props}
      />
    </Squircle>
  );
}

export type SelectValueProps = Omit<ComponentProps<typeof BaseSelect.Value>, "className"> & {
  className?: string;
};

export function SelectValue({ className, ...props }: SelectValueProps) {
  return (
    <BaseSelect.Value
      data-cl-slot="select-value"
      className={cn("truncate", className)}
      {...props}
    />
  );
}

export type SelectIconProps = Omit<ComponentProps<typeof BaseSelect.Icon>, "className"> & {
  className?: string;
};

/**
 * Flips with the popup and is `aria-hidden` because Base UI already exposes the
 * expanded state; the glyph is decoration, not information.
 */
export function SelectIcon({ className, ...props }: SelectIconProps) {
  return (
    <BaseSelect.Icon
      data-cl-slot="select-icon"
      className={cn(
        "shrink-0 text-foreground-tertiary",
        "transition-transform duration-(--cl-duration-fast) ease-cl-out",
        "group-data-[popup-open]:rotate-180",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </BaseSelect.Icon>
  );
}

export type SelectContentProps = Omit<ComponentProps<typeof BaseSelect.Popup>, "className"> & {
  /** Applied to the clipped element: the frost, padding and text. */
  className?: string;
  /** Applied to the wrapper, which is what is positioned and animated. */
  wrapperClassName?: string;
  /** Gap between the trigger and the popup, in px. */
  sideOffset?: number;
  /** Preferred side; Base UI flips when there is not enough room. */
  side?: ComponentProps<typeof BaseSelect.Positioner>["side"];
  align?: ComponentProps<typeof BaseSelect.Positioner>["align"];
};

/**
 * Portal, positioner and popup in the composition everyone actually wants.
 *
 * Two details come straight from Base UI:
 *
 * - `origin-[var(--transform-origin)]` — the positioner computes where the
 *   popup should *appear to grow from* based on the trigger's position, so the
 *   scale-in reads as the trigger unfolding rather than a box fading in.
 * - `--available-height` / `--anchor-width` — measured space, so the list never
 *   spills past the viewport and the popup can match the trigger's width.
 */
export function SelectContent({
  className,
  wrapperClassName,
  children,
  sideOffset,
  side,
  align = "start",
  ...props
}: SelectContentProps) {
  const positionerRef = useRef<HTMLDivElement>(null);
  const themedSideOffset = () => {
    const element = positionerRef.current;
    if (!element) return 0;
    const value = element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .getPropertyValue("--cl-select-side-offset");
    return Number.parseFloat(value ?? "") || 0;
  };

  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        ref={positionerRef}
        sideOffset={sideOffset ?? themedSideOffset}
        side={side}
        align={align}
        className="z-50 outline-none select-none"
      >
        {/*
          The width constraints and the entrance sit on the wrapper: it is what
          the SVG overlays anchor to, so it has to be exactly the shape's box,
          and it is what `.cl-enter-root` scales. `--transform-origin` is set by
          Base UI on the positioner above and inherits down, so the popup still
          grows out of the trigger.
        */}
        <Squircle
          asChild
          radius="medium"
          wrapperClassName={cn(
            "cl-enter-root origin-[var(--transform-origin)] w-fit",
            "min-w-[var(--anchor-width)] max-w-[min(var(--cl-select-max-width),var(--available-width))]",
            wrapperClassName,
          )}
        >
          <BaseSelect.Popup
            data-cl-slot="select-content"
            className={cn("cl-frost p-1 font-sans text-foreground", className)}
            {...props}
          >
            <BaseSelect.List className="max-h-[min(var(--available-height),var(--cl-select-max-height))] overflow-y-auto overscroll-contain">
              {children}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </Squircle>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export type SelectItemProps = Omit<ComponentProps<typeof BaseSelect.Item>, "className"> & {
  className?: string;
};

const itemBase = [
  "relative flex cursor-default items-center gap-2 rounded-item px-2 py-1.5",
  "text-callout text-foreground-secondary outline-none select-none",
  "data-[highlighted]:bg-control data-[highlighted]:text-foreground",
  "data-[selected]:bg-accent-background data-[selected]:text-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:text-foreground-disabled",
  "[&_svg]:size-4",
  "transition-colors duration-(--cl-duration-fast) ease-cl-out",
].join(" ");

/**
 * The item radius has its own token so nested corners remain comfortable
 * inside the medium-radius popup.
 */
export function SelectItem({ className, ...props }: SelectItemProps) {
  return (
    <BaseSelect.Item data-cl-slot="select-item" className={cn(itemBase, className)} {...props} />
  );
}

export type SelectItemIndicatorProps = Omit<
  ComponentProps<typeof BaseSelect.ItemIndicator>,
  "className"
> & { className?: string };

export function SelectItemIndicator({ className, ...props }: SelectItemIndicatorProps) {
  return (
    <BaseSelect.ItemIndicator
      data-cl-slot="select-item-indicator"
      className={cn("flex w-4 shrink-0 items-center justify-center text-accent", className)}
      {...props}
    >
      <CheckIcon />
    </BaseSelect.ItemIndicator>
  );
}

export type SelectItemTextProps = Omit<ComponentProps<typeof BaseSelect.ItemText>, "className"> & {
  className?: string;
};

export function SelectItemText({ className, ...props }: SelectItemTextProps) {
  return <BaseSelect.ItemText className={cn("truncate", className)} {...props} />;
}

export type SelectGroupProps = Omit<ComponentProps<typeof BaseSelect.Group>, "className"> & {
  className?: string;
};

export function SelectGroup({ className, ...props }: SelectGroupProps) {
  return <BaseSelect.Group className={className} {...props} />;
}

export type SelectGroupLabelProps = Omit<
  ComponentProps<typeof BaseSelect.GroupLabel>,
  "className"
> & { className?: string };

export function SelectGroupLabel({ className, ...props }: SelectGroupLabelProps) {
  return (
    <BaseSelect.GroupLabel
      className={cn("px-2 py-1.5 text-label text-foreground-hint", className)}
      {...props}
    />
  );
}

export type SelectSeparatorProps = Omit<
  ComponentProps<typeof BaseSelect.Separator>,
  "className"
> & { className?: string };

export function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return <BaseSelect.Separator className={cn("my-1 h-px bg-separator", className)} {...props} />;
}

export type SelectLabelProps = Omit<ComponentProps<typeof BaseSelect.Label>, "className"> & {
  className?: string;
};

export function SelectLabel({ className, ...props }: SelectLabelProps) {
  return (
    <BaseSelect.Label className={cn("text-label text-foreground-tertiary", className)} {...props} />
  );
}
