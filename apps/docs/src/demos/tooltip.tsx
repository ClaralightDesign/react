import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipGroup,
  TooltipProvider,
  TooltipTrigger,
} from "@claralight-design/react";

/**
 * Hover a control and the label appears after its dwell; move along the shared
 * row and one popup follows the new trigger, morphing its content on the way.
 * The tail leads: it goes as far towards the new trigger as its edge allows and
 * waits there, so it is already pointing before the surface has arrived.
 * `TooltipProvider` shares one dwell across the group.
 *
 * Deliberately hover and keyboard focus only. A tooltip that needs a long press
 * to read is a tooltip nobody reads, so on touch the information belongs in the
 * interface itself — or in a `Popover`, which is made to be opened.
 */
export function TooltipDemo() {
  return (
    <TooltipProvider>
      <div className="flex flex-col items-center gap-8">
        <TooltipGroup motion="morph">
          <div className="flex items-center">
            {["Align left", "Align centre", "Align right"].map((label) => (
              <TooltipTrigger
                key={label}
                payload={label}
                render={<Button variant="ghost" size="sm" />}
              >
                {label}
              </TooltipTrigger>
            ))}
          </div>
        </TooltipGroup>

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
