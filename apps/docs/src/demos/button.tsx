import { Button } from "@claralight-design/react";

/**
 * Every variant and size in one place, so the difference between them is
 * visible at a glance rather than described.
 *
 * Hover a filled control to see the lift, and hold the mouse down to feel the
 * spring: `.cl-press` scales the control up while held and springs it back on
 * release, with the overshoot scaled to however far it actually travelled.
 */
export function ButtonDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">Variants</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Upload</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Details</Button>
          <Button variant="danger">Delete</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">Sizes</span>
        <div className="flex flex-wrap items-end gap-2">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-foreground-hint">Disabled</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled>
            Upload
          </Button>
          <Button variant="secondary" disabled>
            Cancel
          </Button>
          <Button variant="ghost" disabled>
            Details
          </Button>
          {/* Danger drops its colour when disabled, so a destructive action
              never reads as available. */}
          <Button variant="danger" disabled>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
