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
 * Base UI keeps the popup mounted until its transition finishes, driving it
 * through `data-starting-style` and `data-ending-style`. So the exit animation
 * is pure CSS and nothing imperatively waits on it.
 *
 * Reopening mid-exit reverses from the current value rather than restarting,
 * because that is what a CSS transition does.
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
