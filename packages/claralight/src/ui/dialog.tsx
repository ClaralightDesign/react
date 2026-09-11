"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { type ComponentProps, type ReactNode, useCallback, useMemo, useState } from "react";
import { MorphSourceProvider, useMorphAnchor, useMorphSource, useSurfaceMorph } from "@/lib/morph";
import { composeRefs, Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

export type DialogProps<Payload = unknown> = BaseDialog.Root.Props<Payload>;

/**
 * The modal root, which also remembers where it was opened from.
 *
 * `Dialog.Popup` grows out of the trigger's rectangle, so the two have to know
 * about each other; passing the anchor between siblings is what this component
 * exists for. It is the same provider the select will use, so both surfaces
 * morph with one implementation.
 *
 * The open state is mirrored here — not invented here. `open` still wins when it
 * is controlled, and `onOpenChange` still fires for every change, so a consumer's
 * own state stays the single source of truth; the mirror only exists because the
 * popup, which is a *sibling* of the trigger, has to know when a dismissal began
 * in order to reverse the morph before Base UI unmounts it.
 */ export function Dialog<Payload = unknown>({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: DialogProps<Payload>) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const handleOpenChange = useCallback(
    (next: boolean, details: BaseDialog.Root.ChangeEventDetails) => {
      setUncontrolled(next);
      onOpenChange?.(next, details);
    },
    [onOpenChange],
  );

  return (
    <MorphSourceProvider open={open ?? uncontrolled}>
      <BaseDialog.Root
        open={open}
        defaultOpen={open === undefined ? defaultOpen : undefined}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </MorphSourceProvider>
  );
}

export type DialogTriggerProps = Omit<ComponentProps<typeof BaseDialog.Trigger>, "className"> & {
  className?: string;
};

export function DialogTrigger({ className, ref, ...props }: DialogTriggerProps) {
  const anchor = useMorphAnchor();
  const mergedRef = useMemo(() => composeRefs(anchor ?? undefined, ref), [anchor, ref]);
  return <BaseDialog.Trigger ref={mergedRef} className={className} {...props} />;
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
 * The wrapper is also what `useSurfaceMorph` transforms: the dialog is laid out
 * at its final size and carried from the trigger's rectangle onto itself, which
 * is the one entrance the whole language shares. The geometry drives the
 * content's opacity with it, so the layer is still visible while it collapses
 * back into its trigger.
 *
 * **No shadow**, unlike every other floating layer. A modal is separated from the
 * page by its scrim, and `--shadow-frost` under a 45% scrim is two depth cues
 * claiming the same edge, which reads as a halo rather than as distance. A dialog
 * that has no scrim — `modal={false}`, or one laid over its own artwork — asks for
 * it back with `shadow-dialog`, which is what that token is for.
 */
export function DialogPopup({ className, wrapperClassName, ...props }: DialogPopupProps) {
  const source = useMorphSource();
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  useSurfaceMorph({ surface, anchor: source?.anchor, open: source?.open ?? true });

  return (
    <BaseDialog.Portal>
      <DialogBackdrop />
      <Squircle
        asChild
        radius="dialog"
        wrapperRef={setSurface}
        wrapperClassName={cn(
          "cl-enter-root cl-morph fixed top-1/2 left-1/2 z-50 w-full max-w-lg",
          "-translate-x-1/2 -translate-y-1/2",
          wrapperClassName,
        )}
      >
        <BaseDialog.Popup
          data-cl-slot="dialog-popup"
          className={cn(
            "cl-exit-sentinel cl-frost p-6 font-sans text-foreground shadow-none",
            className,
          )}
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
