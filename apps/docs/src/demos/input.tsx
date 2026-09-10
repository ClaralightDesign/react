import { Input } from "@claralight/react";

/**
 * The fill is a translucent overlay, not an opaque colour, which is why the
 * same field reads correctly over the window background and over a panel.
 * Switch the preview surface to `panel` in the tab bar to see it.
 */
export function InputDemo() {
  return (
    <div className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Project name</span>
        <Input placeholder="Untitled project" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Owner</span>
        <Input size="sm" defaultValue="claralight" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Description</span>
        <Input size="lg" placeholder="What is this for?" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Disabled</span>
        <Input disabled placeholder="Read only" />
      </label>
    </div>
  );
}
