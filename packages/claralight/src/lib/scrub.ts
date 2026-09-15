/**
 * The arithmetic behind a numeric field's scrub gesture.
 *
 * ## Why this is not Base UI's scrub arithmetic
 *
 * `NumberField.ScrubArea` already solves the hard platform problems — pointer
 * lock, a virtual cursor that wraps at the viewport edge, suppressing touch
 * scroll — and ClaraLight keeps all of it. What it cannot keep is the increment
 * rule. Base UI accumulates pointer movement until it passes `pixelSensitivity`
 * and then applies `movementX * step` in one go, which makes the value's rate
 * depend on how the browser happened to coalesce pointer events.
 *
 * ClaraLight draws a ruler under the pointer while scrubbing, and a ruler is a
 * promise: **one tick crossing the centre line is exactly one step**. That only
 * holds if the mapping is `deltaX / spacing` with the fractional remainder
 * carried to the next event, which is what `advanceScrub` does. So the scrub
 * area's own rule is neutralised (see `number-input.tsx`) and this runs instead.
 *
 * ## Precision comes from the other axis
 *
 * Horizontal movement changes the value; vertical movement changes how much
 * horizontal movement one step costs. Dragging *down* stretches the ruler and
 * buys precision, dragging *up* compresses it — the convention Figma, Blender
 * and After Effects share. The bands are latched rather than continuous, with
 * hysteresis at each boundary, so a hand that wavers on a boundary does not
 * flicker between two sensitivities.
 *
 * Every value here is the Flutter field's, so the two platforms scrub at
 * identical rates: `_NumericScrubMetrics` in `inputs/text_field.dart`.
 */

/** Pixels of horizontal travel per step at the neutral band. */
export const SCRUB_BASE_SPACING = 8;

/** Vertical distance at which the first precision band is entered. */
export const SCRUB_INNER_BAND = 50;

/** Vertical distance at which the second precision band is entered. */
export const SCRUB_OUTER_BAND = 150;

/** Slack a band keeps before giving the pointer back to its neighbour. */
export const SCRUB_BAND_HYSTERESIS = 4;

/** How long the ruler takes to settle after a band change, in milliseconds. */
export const SCRUB_SPACING_TRANSITION = 80;

/**
 * Which precision band the gesture is latched into.
 *
 * Negative is upward travel and coarser; positive is downward and finer. `0`
 * is the neutral band the gesture starts in.
 */
export type ScrubTier = -2 | -1 | 0 | 1 | 2;

/**
 * Steps per pixel relative to the neutral band: `4` covers four times the
 * ground for the same movement, `0.25` a quarter of it.
 */
const TIER_MULTIPLIER: Record<ScrubTier, number> = {
  [-2]: 4,
  [-1]: 2,
  0: 1,
  1: 0.5,
  2: 0.25,
};

/**
 * The band `dy` belongs in, given the band it is currently in.
 *
 * Latched, not computed from `dy` alone: leaving a band needs `dy` to clear its
 * boundary by `SCRUB_BAND_HYSTERESIS`, entering only needs to reach it. The
 * loop re-runs because a single large jump — a coalesced move, or a pointer
 * that was warped across the viewport — can cross more than one boundary.
 */
export function nextScrubTier(tier: ScrubTier, dy: number): ScrubTier {
  let current = tier;
  for (;;) {
    const previous = current;
    switch (current) {
      case -2:
        if (dy >= -SCRUB_OUTER_BAND + SCRUB_BAND_HYSTERESIS) current = -1;
        break;
      case -1:
        if (dy <= -SCRUB_OUTER_BAND) current = -2;
        else if (dy >= -SCRUB_INNER_BAND + SCRUB_BAND_HYSTERESIS) current = 0;
        break;
      case 0:
        if (dy <= -SCRUB_INNER_BAND) current = -1;
        else if (dy >= SCRUB_INNER_BAND) current = 1;
        break;
      case 1:
        if (dy <= SCRUB_INNER_BAND - SCRUB_BAND_HYSTERESIS) current = 0;
        else if (dy >= SCRUB_OUTER_BAND) current = 2;
        break;
      case 2:
        if (dy <= SCRUB_OUTER_BAND - SCRUB_BAND_HYSTERESIS) current = 1;
        break;
    }
    if (current === previous) return current;
  }
}

/** Pixels of horizontal travel one step costs in a band — the ruler's pitch. */
export function scrubSpacing(tier: ScrubTier): number {
  return SCRUB_BASE_SPACING / TIER_MULTIPLIER[tier];
}

export interface ScrubAdvanceOptions {
  /** Sub-step remainder carried from the previous event, in steps. */
  progress: number;
  /** Horizontal pointer movement since the previous event, in pixels. */
  deltaX: number;
  /** Pixels per step, from `scrubSpacing`. */
  spacing: number;
  /** Whether the value can still move the given way. Asked before and after. */
  canStep: (direction: 1 | -1) => boolean;
  /** Applies whole steps. Never called with zero. */
  applySteps: (steps: number) => void;
}

/**
 * Advance the gesture by one pointer event and return the remainder to carry.
 *
 * The remainder is what makes slow scrubbing work: at 32px per step a typical
 * 2px pointer move is 1/16th of a step, and dropping it would mean the value
 * never changed at all. It is dropped deliberately in two places, both of which
 * are the pointer pushing against a bound — carrying a remainder accumulated
 * against `max` would make the value jump the moment the drag turned around.
 */
export function advanceScrub({
  progress,
  deltaX,
  spacing,
  canStep,
  applySteps,
}: ScrubAdvanceOptions): number {
  if (deltaX === 0) return progress;

  const direction = deltaX > 0 ? 1 : -1;
  if (!canStep(direction)) return 0;

  const combined = progress + deltaX / spacing;
  const steps = Math.trunc(combined);
  if (steps === 0) return combined;

  applySteps(steps);
  return canStep(steps > 0 ? 1 : -1) ? combined - steps : 0;
}

/**
 * Whole steps between `value` and a bound, or `null` when unbounded.
 *
 * This is what truncates the ruler: past the last reachable tick there is
 * nothing to draw, so the gesture's remaining range is visible rather than
 * something the user discovers by pushing into a wall.
 *
 * The tolerance is what keeps `0.1 + 0.2` from costing a tick. A distance that
 * is a whole number of steps to within floating-point noise is that many steps;
 * anything else rounds up, because a partial step is still a tick the value can
 * reach (it lands on the bound, clamped).
 */
export function stepsToBoundary(
  boundary: number | undefined,
  value: number,
  step: number,
  increasing: boolean,
): number | null {
  if (boundary === undefined || !Number.isFinite(boundary) || !Number.isFinite(step) || step <= 0) {
    return null;
  }

  const distance = increasing ? boundary - value : value - boundary;
  if (distance <= 0) return 0;

  const ratio = distance / step;
  if (!Number.isFinite(ratio)) return null;

  const nearest = Math.round(ratio);
  const tolerance = 1e-9 * Math.max(1, Math.abs(ratio));
  return Math.abs(ratio - nearest) <= tolerance ? nearest : Math.ceil(ratio);
}

/**
 * Drop the floating-point residue a chain of steps leaves behind.
 *
 * `0.1 + 0.2` is `0.30000000000000004`, and a scrub is thousands of those in a
 * row. Fifteen significant digits is the widest round-trip a double survives,
 * so this discards the error without touching a value the user actually typed.
 */
export function roundScrubbedValue(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Number.parseFloat(value.toPrecision(15));
}
