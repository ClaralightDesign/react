import { Button, NumberInput, Progress } from "@claralight-design/react";
import { useState } from "react";

/**
 * The two ends are the thing to watch.
 *
 * Drag the number down towards 0 or up towards 100. The gap between the
 * indicator and the track closes on its own — there is no room for it there, so
 * it takes what room there is rather than pushing the track off the rail — and
 * the piece that is running out of room stays round the whole way: it becomes a
 * dot and the dot shrinks, instead of flattening into a sliver the height of the
 * rail. Both rules again between the travelling lines of the indeterminate bar.
 */
export function ProgressDemo() {
  const [value, setValue] = useState<number | null>(38);
  const [running, setRunning] = useState(false);

  return (
    <div className="flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="text-label text-foreground-hint">Determinate</span>
        {/* Clear the field and every bar below goes indeterminate: `value` is
            null, which is the same component with no number to report rather
            than a second one. */}
        <Progress value={value} aria-label="Export" />
        <NumberInput
          size="sm"
          suffix="%"
          min={0}
          max={100}
          value={value}
          onValueChange={setValue}
        />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-label text-foreground-hint">Thickness</span>
        {/* The same value on all three, so the ladder is the only variable: the
            gap does not scale with the rail, and neither does the dot the ends
            collapse to — it is as wide as the bar is thick, whichever bar it
            is. */}
        <Progress size="sm" value={value} aria-label="Copy, hairline" />
        <Progress size="md" value={value} aria-label="Copy, default" />
        <Progress size="lg" value={value} aria-label="Copy, prominent" />
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-label text-foreground-hint">Indeterminate</span>
        {/* `null` is the indeterminate bar — the same control, with the same
            role and the same semantics, minus a number to report. */}
        <Progress value={running ? null : 100} aria-label="Indexing" />
        <div>
          <Button size="sm" variant="secondary" onClick={() => setRunning((on) => !on)}>
            {running ? "Finish" : "Start"}
          </Button>
        </div>
      </div>
    </div>
  );
}
