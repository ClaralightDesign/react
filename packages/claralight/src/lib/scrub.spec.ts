import { describe, expect, it } from "vitest";
import {
  advanceScrub,
  nextScrubTier,
  roundScrubbedValue,
  SCRUB_BAND_HYSTERESIS,
  SCRUB_BASE_SPACING,
  SCRUB_INNER_BAND,
  SCRUB_OUTER_BAND,
  type ScrubTier,
  scrubSpacing,
  stepsToBoundary,
} from "./scrub";

/** A `canStep` that never refuses, for the cases that are not about bounds. */
const unbounded = () => true;

/** Walks `dy` through a sequence of positions, latching the band at each one. */
function latch(positions: number[], from: ScrubTier = 0): ScrubTier[] {
  let tier = from;
  return positions.map((dy) => {
    tier = nextScrubTier(tier, dy);
    return tier;
  });
}

describe("nextScrubTier", () => {
  it("stays neutral inside the inner band", () => {
    expect(latch([0, 20, -20, 49, -49])).toEqual([0, 0, 0, 0, 0]);
  });

  it("latches finer downward and coarser upward", () => {
    expect(nextScrubTier(0, SCRUB_INNER_BAND)).toBe(1);
    expect(nextScrubTier(0, SCRUB_OUTER_BAND)).toBe(2);
    expect(nextScrubTier(0, -SCRUB_INNER_BAND)).toBe(-1);
    expect(nextScrubTier(0, -SCRUB_OUTER_BAND)).toBe(-2);
  });

  it("holds a band until the pointer clears it by the hysteresis", () => {
    // Entering costs exactly the boundary; leaving costs the boundary less the slack.
    const inside = SCRUB_INNER_BAND - SCRUB_BAND_HYSTERESIS + 1;
    expect(nextScrubTier(1, inside)).toBe(1);
    expect(nextScrubTier(1, SCRUB_INNER_BAND - SCRUB_BAND_HYSTERESIS)).toBe(0);
  });

  it("does not flicker when the pointer wavers on a boundary", () => {
    const wobble = [SCRUB_INNER_BAND, 49, SCRUB_INNER_BAND, 48, SCRUB_INNER_BAND];
    expect(latch(wobble)).toEqual([1, 1, 1, 1, 1]);
  });

  it("crosses more than one boundary in a single jump", () => {
    // A pointer warped across the viewport arrives with a large delta at once.
    expect(nextScrubTier(-2, SCRUB_OUTER_BAND)).toBe(2);
    expect(nextScrubTier(2, -SCRUB_OUTER_BAND)).toBe(-2);
  });
});

describe("scrubSpacing", () => {
  it("stretches the ruler downward and compresses it upward", () => {
    expect(scrubSpacing(0)).toBe(SCRUB_BASE_SPACING);
    expect(scrubSpacing(1)).toBe(16);
    expect(scrubSpacing(2)).toBe(32);
    expect(scrubSpacing(-1)).toBe(4);
    expect(scrubSpacing(-2)).toBe(2);
  });
});

describe("advanceScrub", () => {
  it("commits one step per tick crossed", () => {
    const applied: number[] = [];
    const progress = advanceScrub({
      progress: 0,
      deltaX: SCRUB_BASE_SPACING * 3,
      spacing: SCRUB_BASE_SPACING,
      canStep: unbounded,
      applySteps: (steps) => applied.push(steps),
    });
    expect(applied).toEqual([3]);
    expect(progress).toBe(0);
  });

  it("carries the remainder so slow movement still reaches a step", () => {
    const applied: number[] = [];
    let progress = 0;
    // Sixteen 2px moves at 32px per step: one step, not zero.
    for (let index = 0; index < 16; index += 1) {
      progress = advanceScrub({
        progress,
        deltaX: 2,
        spacing: 32,
        canStep: unbounded,
        applySteps: (steps) => applied.push(steps),
      });
    }
    expect(applied).toEqual([1]);
    expect(progress).toBeCloseTo(0, 12);
  });

  it("ignores an event that did not move", () => {
    const applied: number[] = [];
    const progress = advanceScrub({
      progress: 0.5,
      deltaX: 0,
      spacing: SCRUB_BASE_SPACING,
      canStep: unbounded,
      applySteps: (steps) => applied.push(steps),
    });
    expect(applied).toEqual([]);
    expect(progress).toBe(0.5);
  });

  it("drops the carry when the pointer pushes against a bound", () => {
    const applied: number[] = [];
    const progress = advanceScrub({
      progress: 0.5,
      deltaX: 4,
      spacing: SCRUB_BASE_SPACING,
      canStep: (direction) => direction < 0,
      applySteps: (steps) => applied.push(steps),
    });
    expect(applied).toEqual([]);
    expect(progress).toBe(0);
  });

  it("drops the carry when the step it just applied reached the bound", () => {
    const applied: number[] = [];
    let remaining = 1;
    const progress = advanceScrub({
      progress: 0,
      deltaX: SCRUB_BASE_SPACING * 1.5,
      spacing: SCRUB_BASE_SPACING,
      canStep: () => remaining > 0,
      applySteps: (steps) => {
        applied.push(steps);
        remaining -= steps;
      },
    });
    expect(applied).toEqual([1]);
    expect(progress).toBe(0);
  });

  it("steps symmetrically in both directions", () => {
    const applied: number[] = [];
    const progress = advanceScrub({
      progress: 0,
      deltaX: -SCRUB_BASE_SPACING * 2,
      spacing: SCRUB_BASE_SPACING,
      canStep: unbounded,
      applySteps: (steps) => applied.push(steps),
    });
    expect(applied).toEqual([-2]);
    expect(progress).toBe(0);
  });
});

describe("stepsToBoundary", () => {
  it("is null without a bound", () => {
    expect(stepsToBoundary(undefined, 0, 1, true)).toBeNull();
  });

  it("counts whole steps to the bound", () => {
    expect(stepsToBoundary(10, 4, 2, true)).toBe(3);
    expect(stepsToBoundary(0, 4, 2, false)).toBe(2);
  });

  it("is zero once the bound is reached or passed", () => {
    expect(stepsToBoundary(10, 10, 1, true)).toBe(0);
    expect(stepsToBoundary(10, 12, 1, true)).toBe(0);
  });

  it("rounds a partial step up, since the value can still land on the bound", () => {
    expect(stepsToBoundary(10, 0, 3, true)).toBe(4);
  });

  it("does not spend a tick on floating-point noise", () => {
    // 0.3 / 0.1 is 2.9999999999999996, which must still read as three steps.
    expect(stepsToBoundary(0.3, 0, 0.1, true)).toBe(3);
  });
});

describe("roundScrubbedValue", () => {
  it("discards the residue a chain of steps leaves", () => {
    expect(roundScrubbedValue(0.1 + 0.2)).toBe(0.3);
  });

  it("leaves a value the user could have typed alone", () => {
    expect(roundScrubbedValue(12.5)).toBe(12.5);
    expect(roundScrubbedValue(-0.125)).toBe(-0.125);
  });
});
