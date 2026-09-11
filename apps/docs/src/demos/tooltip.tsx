import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@claralight/react";

/**
 * Hover a control and the label appears after its dwell; move along the row and
 * the rest appear instantly, because `TooltipProvider` shares one dwell across
 * the group. Pause long enough and the dwell comes back.
 *
 * Deliberately hover and keyboard focus only. A tooltip that needs a long press
 * to read is a tooltip nobody reads, so on touch the information belongs in the
 * interface itself — or in a `Popover`, which is made to be opened.
 */
export function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-8">
        <div className="flex items-center gap-2">
          {[
            ["Align left", "top"],
            ["Align centre", "top"],
            ["Align right", "top"],
          ].map(([label]) => (
            <Tooltip key={label}>
              <TooltipTrigger render={<Button variant="ghost" size="sm" />}>{label}</TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {(["top", "bottom", "left", "right"] as const).map((side) => (
            <Tooltip key={side}>
              <TooltipTrigger render={<Button variant="secondary" size="sm" />}>
                {side}
              </TooltipTrigger>
              <TooltipContent side={side}>Anchored {side}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
