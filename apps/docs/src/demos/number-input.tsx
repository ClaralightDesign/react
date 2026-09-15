import { NumberInput } from "@claralight-design/react";
import { useState } from "react";

/**
 * The inspector row the design is built around. Drag the axis letter or the
 * chevron strip sideways: a ruler replaces the value, one tick per step, and
 * dragging *down* stretches that ruler for finer control.
 */
export function NumberInputDemo() {
  const [x, setX] = useState<number | null>(12);
  const [y, setY] = useState<number | null>(0);
  const [opacity, setOpacity] = useState<number | null>(100);

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <div className="flex gap-2">
        {/* Positional fields step along the axis their chevrons point down. */}
        <NumberInput
          size="sm"
          prefix="X"
          suffix="px"
          direction="right"
          value={x}
          onValueChange={setX}
        />
        <NumberInput
          size="sm"
          prefix="Y"
          suffix="px"
          direction="down"
          value={y}
          onValueChange={setY}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Opacity</span>
        <NumberInput
          suffix="%"
          min={0}
          max={100}
          value={opacity}
          onValueChange={setOpacity}
          onValueCommitted={(value, reason) => console.log("committed", value, reason)}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Corner radius</span>
        {/* A fractional step; the ruler's finest band moves it a hundredth at a time. */}
        <NumberInput size="lg" prefix="R" suffix="px" step={0.5} min={0} defaultValue={8} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-tertiary">Disabled</span>
        <NumberInput disabled prefix="W" suffix="px" defaultValue={240} />
      </label>
    </div>
  );
}
