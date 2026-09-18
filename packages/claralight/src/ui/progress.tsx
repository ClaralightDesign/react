"use client";

import { Progress as BaseProgress } from "@base-ui/react/progress";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * ClaraLight's progress bar.
 *
 * The rail is two pieces with a gap between them — the active indicator, and
 * the track it has not reached yet — rather than one bar filling up. That gap
 * is the whole design: two shapes that meet edge to edge read as a single
 * object changing colour, and two that stand apart read as a distance being
 * covered. It closes on its own as the indicator runs out of room at either
 * end, so a bar at 0 and a bar at 100 are both a single clean shape.
 *
 * Both pieces are capsules rather than smooth corners. At these thicknesses the
 * two constructions coincide — the same reason the scroll area's thumb is a
 * plain pill — so there is no `Squircle` here and no wrapper to lay out.
 *
 * Every piece is two elements: the range, and the shape drawn inside it. A
 * round-capped line can never be thinner than it is tall, so a piece that runs
 * out of room becomes a circle and then a smaller circle — which is what the
 * two ends of the rail are made of, and what a single box with a capsule radius
 * cannot do. `progress.css` has the whole of it.
 *
 * ## Determinate and indeterminate are one component
 *
 * `value={null}` is the indeterminate bar, which is Base UI's own convention
 * and the right one: the two states are the same control with the same
 * semantics, and a component that changed identity when a number arrived would
 * take the `role="progressbar"` with it.
 *
 * Indeterminate sends two lines across the rail per cycle, each stretching as
 * it travels — the head leaves first and the tail follows a beat later on the
 * same curve — with the track filling the stretches they leave behind. That is
 * the Material 3 indeterminate figure, on ClaraLight's own acceleration curve
 * and its own palette. It runs entirely in CSS, off four animated custom
 * properties on the rail; see `progress.css`.
 *
 * ## Naming the bar is the caller's job
 *
 * Base UI puts `role="progressbar"` and the value semantics on the root, but
 * the accessible name has to come from somewhere: pass `aria-label`, or point
 * `aria-labelledby` at your own heading. For a labelled row with a readout,
 * compose the parts — `ProgressRoot`, `ProgressLabel`, `ProgressValue` — rather
 * than growing this component a layout it would then own.
 */

/**
 * The rail. `w-full` because a bar has no width of its own: it is as wide as
 * whatever it is reporting on, and a caller's `className` overrides it.
 */
export const progressVariants = cva(["cl-progress block w-full"], {
  variants: {
    /**
     * Thickness. Not the control densities — a progress bar is a line, not a
     * box — so the ladder is its own: a hairline, the default row, and the bar
     * a sheet gives a line of its own.
     */
    size: {
      sm: "h-progress-sm",
      md: "h-progress-md",
      lg: "h-progress-lg",
    },
  },
  defaultVariants: { size: "md" },
});

/** Re-exported unstyled, for composing a labelled row around the bar. */
export const ProgressRoot: typeof BaseProgress.Root = BaseProgress.Root;
export const ProgressTrack: typeof BaseProgress.Track = BaseProgress.Track;
export const ProgressIndicator: typeof BaseProgress.Indicator = BaseProgress.Indicator;
export const ProgressLabel: typeof BaseProgress.Label = BaseProgress.Label;
export const ProgressValue: typeof BaseProgress.Value = BaseProgress.Value;

export interface ProgressProps
  extends Omit<ComponentProps<typeof BaseProgress.Root>, "children" | "className" | "render">,
    VariantProps<typeof progressVariants> {
  /** Applied to the rail: thickness, width, and the colours of its segments. */
  className?: string;
  /**
   * Applied to the root, which is the element a caller's grid or flex lays out
   * and the one carrying the `progressbar` role.
   */
  wrapperClassName?: string;
  /*
   * No `children`: the rail's segments are the component, and a caller's own
   * node inside the root would land beside them with nothing positioning it.
   * A label or a readout goes next to the bar, from the parts above.
   */
}

/**
 * How far along the rail the indicator ends, as a fraction.
 *
 * Deliberately the same arithmetic Base UI runs for the indicator's width,
 * including its answers at the edges: `max === min` is a full bar rather than
 * an empty one, and a value that is not a number at all is the start of the
 * range. The two have to agree — they are the two ends of the same gap.
 */
function progressFraction(value: number | null | undefined, min: number, max: number) {
  if (value == null || !Number.isFinite(value)) return null;
  const fraction = (value - min) / (max - min);
  return Math.min(Math.max(Number.isNaN(fraction) ? 0 : fraction, 0), 1);
}

export function Progress({
  className,
  wrapperClassName,
  size,
  value,
  min = 0,
  max = 100,
  style,
  ...props
}: ProgressProps) {
  const fraction = progressFraction(value, min, max);
  return (
    <BaseProgress.Root
      data-cl-slot="progress"
      value={value}
      min={min}
      max={max}
      className={cn("block w-full", wrapperClassName)}
      // The fraction is inherited rather than passed to the one element that
      // needs it, because the track is positioned from where the indicator
      // ends: the number belongs to the bar, not to either piece of it.
      style={
        fraction === null
          ? style
          : ({ ...style, "--cl-progress-value": String(fraction) } as CSSProperties)
      }
      {...props}
    >
      <BaseProgress.Track
        data-cl-slot="progress-track"
        className={cn(progressVariants({ size }), className)}
      >
        {fraction === null ? (
          <>
            {/* Start edge to the trailing line, between the lines, and the
                leading line to the end edge. Each is bounded by whichever
                moving edge is nearest it, so the five segments below are a
                chain rather than five independent animations. */}
            <div
              data-cl-slot="progress-track-span"
              className="cl-progress-span cl-progress-track cl-progress-track-1"
            >
              <div className="cl-progress-fill" />
            </div>
            <div
              data-cl-slot="progress-track-span"
              className="cl-progress-span cl-progress-track cl-progress-track-2"
            >
              <div className="cl-progress-fill" />
            </div>
            <div
              data-cl-slot="progress-track-span"
              className="cl-progress-span cl-progress-track cl-progress-track-3"
            >
              <div className="cl-progress-fill" />
            </div>
            {/* Base UI leaves the indicator unsized while indeterminate, so it
                is free to be the box the two lines are placed against. */}
            <BaseProgress.Indicator data-cl-slot="progress-indicator" className="cl-progress-lines">
              <div
                data-cl-slot="progress-line"
                className="cl-progress-span cl-progress-line cl-progress-line-1"
              >
                <div className="cl-progress-fill" />
              </div>
              <div
                data-cl-slot="progress-line"
                className="cl-progress-span cl-progress-line cl-progress-line-2"
              >
                <div className="cl-progress-fill" />
              </div>
            </BaseProgress.Indicator>
          </>
        ) : (
          <>
            <BaseProgress.Indicator
              data-cl-slot="progress-indicator"
              className="cl-progress-indicator"
            >
              <div className="cl-progress-fill" />
            </BaseProgress.Indicator>
            <div
              data-cl-slot="progress-track-span"
              className="cl-progress-span cl-progress-track cl-progress-remainder"
            >
              <div className="cl-progress-fill" />
            </div>
          </>
        )}
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
