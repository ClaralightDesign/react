"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ComponentProps, ReactNode } from "react";
import { Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

export const Dialog: typeof BaseDialog.Root = BaseDialog.Root;

export type DialogTriggerProps = Omit<ComponentProps<typeof BaseDialog.Trigger>, "className"> & {
  className?: string;
};

export function DialogTrigger({ className, ...props }: DialogTriggerProps) {
  return <BaseDialog.Trigger className={className} {...props} />;
}

export type DialogBackdropProps = Omit<ComponentProps<typeof BaseDialog.Backdrop>, "className"> & {
  className?: string;
};

/**
 * The barrier behind the dialog. Fades on one duration only, so it lands fast
 * enough that the page behind never feels stuck.
 */
export function DialogBackdrop({ className, ...props }: DialogBackdropProps) {
  return (
    <BaseDialog.Backdrop
      data-cl-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-scrim",
        "transition-opacity duration-(--cl-duration-surface) ease-cl-out",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

export type DialogPopupProps = Omit<ComponentProps<typeof BaseDialog.Popup>, "className"> & {
  /** Applied to the clipped element: the frost, padding and text. */
  className?: string;
  /** Applied to the wrapper, which is what gets positioned and animated. */
  wrapperClassName?: string;
  /** Rendered inside the popup, above the body. */
  children?: ReactNode;
};

/**
 * The frosted modal surface.
 *
 * Base UI marks the popup with `data-starting-style` and `data-ending-style`
 * and waits for animations on the popup element before calling `forceUnmount`.
 * The visible transition belongs to the wrapper, so `cl-exit-sentinel` adds a
 * non-visual custom-property animation to the popup; Base UI can then wait for
 * the wrapper's exit duration without moving the clipped surface separately.
 *
 * The positioning and the entrance live on the **wrapper**, not the popup. The
 * popup is the clipped element and the SVG border and shadow overlays are its
 * siblings, so scaling the popup alone would leave the 1px border and the shadow
 * at their final size — 5% of a 512px dialog is 25px, plainly visible over the
 * 250ms entrance. `.cl-enter-root` lifts Base UI's transition state onto the
 * wrapper with `:has()`, so fill, border and shadow move as one object.
 *
 * Reopening mid-exit reverses from the current value, because that is what a
 * CSS transition does.
 */
export function DialogPopup({ className, wrapperClassName, ...props }: DialogPopupProps) {
  return (
    <BaseDialog.Portal>
      <DialogBackdrop />
      <Squircle
        asChild
        radius="dialog"
        wrapperClassName={cn(
          "cl-enter-root fixed top-1/2 left-1/2 z-50 w-full max-w-lg",
          "-translate-x-1/2 -translate-y-1/2",
          wrapperClassName,
        )}
      >
        <BaseDialog.Popup
          data-cl-slot="dialog-popup"
          className={cn("cl-exit-sentinel cl-frost p-6 font-sans text-foreground", className)}
          {...props}
        />
      </Squircle>
    </BaseDialog.Portal>
  );
}

export type DialogTitleProps = Omit<ComponentProps<typeof BaseDialog.Title>, "className"> & {
  className?: string;
};

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <BaseDialog.Title
      data-cl-slot="dialog-title"
      className={cn("text-headline text-foreground", className)}
      {...props}
    />
  );
}

export type DialogDescriptionProps = Omit<
  ComponentProps<typeof BaseDialog.Description>,
  "className"
> & { className?: string };

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <BaseDialog.Description
      data-cl-slot="dialog-description"
      className={cn("text-caption text-foreground-tertiary", className)}
      {...props}
    />
  );
}

export type DialogCloseProps = Omit<ComponentProps<typeof BaseDialog.Close>, "className"> & {
  className?: string;
};

export function DialogClose({ className, ...props }: DialogCloseProps) {
  return <BaseDialog.Close className={className} {...props} />;
}
