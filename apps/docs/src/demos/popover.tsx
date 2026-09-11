import {
  Button,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@claralight/react";

/**
 * The arrow is part of the surface, not an element parked against it: one
 * clip-path covers the body and the tail, so the frost, the backdrop blur and
 * the 1px outline cross the join as a single shape. Scroll the preview and the
 * tail slides along the edge while the popover stays put; scroll further and
 * Base UI flips the side, which moves the tail to the opposite edge.
 *
 * `side` is the *preferred* side only. Everything after that — flipping,
 * shifting along the edge, staying on screen once the trigger has scrolled
 * away — is Floating UI's, driven by ClaraLight's gap and margin tokens.
 */
export function PopoverDemo() {
  return (
    <div className="flex flex-col items-center gap-8">
      <Popover>
        <PopoverTrigger render={<Button variant="primary" />}>Share file</PopoverTrigger>
        <PopoverContent className="max-w-xs">
          <div className="flex flex-col gap-1.5">
            <PopoverTitle>Anyone with the link</PopoverTitle>
            <PopoverDescription>
              Viewers can read and comment, but cannot edit or download the original.
            </PopoverDescription>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <PopoverClose render={<Button variant="ghost" size="sm" />}>Cancel</PopoverClose>
            <PopoverClose render={<Button variant="secondary" size="sm" />}>Copy link</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>

      <div className="grid grid-cols-2 gap-3">
        {(["top", "bottom", "left", "right"] as const).map((side) => (
          <Popover key={side}>
            <PopoverTrigger render={<Button variant="secondary" size="sm" />}>
              {side}
            </PopoverTrigger>
            <PopoverContent side={side}>
              <span className="text-callout text-foreground-secondary">Anchored {side}</span>
            </PopoverContent>
          </Popover>
        ))}
      </div>

      <Popover>
        <PopoverTrigger render={<Button variant="ghost" size="sm" />}>No arrow</PopoverTrigger>
        <PopoverContent arrow={false}>
          <span className="text-callout text-foreground-secondary">
            The same surface, without the tail.
          </span>
        </PopoverContent>
      </Popover>
    </div>
  );
}
