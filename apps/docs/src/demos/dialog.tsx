import {
  Button,
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@claralight/react";

/**
 * Base UI marks the popup with `data-starting-style` and `data-ending-style`
 * and waits for animations on the popup element before calling `forceUnmount`.
 * ClaraLight's visible transition lives on the wrapper, so `cl-exit-sentinel`
 * gives Base UI a non-visual custom-property animation to await without moving
 * the clipped surface separately.
 *
 * The popup is laid out at its final size and carried there from the trigger's
 * own rectangle, so a dismissal collapses back into the control that opened it.
 * Opacity moves with that geometry, which is what makes the collapse watchable
 * rather than a fade that finishes first.
 */
export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="primary" />}>Open dialog</DialogTrigger>
      <DialogPopup>
        <div className="flex flex-col gap-2">
          <DialogTitle>Replace existing file?</DialogTitle>
          <DialogDescription>
            The file on disk is newer than the one you have open. Replacing it cannot be undone.
          </DialogDescription>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
          <DialogClose render={<Button variant="danger" />}>Replace</DialogClose>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
