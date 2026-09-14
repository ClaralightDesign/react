import { describe, expect, it } from "vitest";
import { type RevealRect, revealRect, springProgress } from "./reveal";

/** A 240x320 panel at (100, 200), grown out of a 120x36 trigger at (110, 150). */
const BOX: RevealRect = { x: 100, y: 200, width: 240, height: 320 };
const SOURCE: RevealRect = { x: 110, y: 150, width: 120, height: 36 };

/** The wrapper's own coordinates, which is what `revealRect` returns. */
const center = (rect: RevealRect) => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

describe("revealRect", () => {
  it("is the trigger, in the wrapper's coordinates, at zero", () => {
    const rect = revealRect(BOX, SOURCE, 0, 0);
    expect(rect.width).toBeCloseTo(SOURCE.width, 6);
    expect(rect.height).toBeCloseTo(SOURCE.height, 6);
    // Offset by the wrapper's origin: the trigger sits 50px above and 10px right.
    expect(rect.x).toBeCloseTo(SOURCE.x - BOX.x, 6);
    expect(rect.y).toBeCloseTo(SOURCE.y - BOX.y, 6);
  });

  it("is exactly the wrapper's own box at rest", () => {
    const rect = revealRect(BOX, SOURCE, 1, 1);
    expect(rect).toEqual({ x: 0, y: 0, width: BOX.width, height: BOX.height });
  });

  /**
   * The whole point of the primitive: the content is centred in this rectangle,
   * so a centre that did not travel on its own curve would slide the rows
   * sideways under the clip instead of uncovering them in place.
   */
  it("carries the centre from the trigger's to the panel's", () => {
    const half = center(revealRect(BOX, SOURCE, 0.5, 0.5));
    const from = center(SOURCE);
    const to = center(BOX);
    expect(half.x + BOX.x).toBeCloseTo((from.x + to.x) / 2, 6);
    expect(half.y + BOX.y).toBeCloseTo((from.y + to.y) / 2, 6);
  });

  it("stays a rectangle: opposite edges move together", () => {
    const rect = revealRect(BOX, SOURCE, 0.3, 0.3);
    expect(rect.width).toBeCloseTo(SOURCE.width + (BOX.width - SOURCE.width) * 0.3, 6);
    expect(rect.height).toBeCloseTo(SOURCE.height + (BOX.height - SOURCE.height) * 0.3, 6);
  });

  /**
   * The spring's overshoot has to reach the DOM or the settle is never drawn:
   * the centre carries on past where it belongs and comes back. The fixture's
   * trigger sits above its panel, so "past" here is further down.
   */
  it("carries the centre past its resting place above 1 rather than clamping", () => {
    const resting = BOX.y + BOX.height / 2;
    const overshot = center(revealRect(BOX, SOURCE, 1.1, 1)).y + BOX.y;
    expect(overshot).toBeGreaterThan(resting);
    expect(overshot - resting).toBeCloseTo((resting - (SOURCE.y + SOURCE.height / 2)) * 0.1, 6);
  });

  /**
   * The size is on its own clock and never passes 1, even while the centre is
   * overshooting. A panel is only ever as large as it is going to be — springing
   * the size as well puts a tall list off-screen for the length of the settle.
   */
  it("never grows past the resting box, whatever the travel is doing", () => {
    for (const travel of [0.5, 1, 1.1, 1.5]) {
      const rect = revealRect(BOX, SOURCE, travel, 1);
      expect(rect.width).toBeCloseTo(BOX.width, 6);
      expect(rect.height).toBeCloseTo(BOX.height, 6);
    }
  });

  /** A trigger that was unmounted leaves the layer at rest, not at zero size. */
  it("is the resting box when there is nothing to grow out of", () => {
    expect(revealRect(BOX, null, 0, 0)).toEqual({
      x: 0,
      y: 0,
      width: BOX.width,
      height: BOX.height,
    });
  });
});

describe("springProgress", () => {
  const OMEGA = 10.05;
  const ZETA = 0.567;

  it("is pinned at both ends", () => {
    expect(springProgress(0, OMEGA, ZETA)).toBe(0);
    expect(springProgress(1, OMEGA, ZETA)).toBe(1);
    expect(springProgress(-0.5, OMEGA, ZETA)).toBe(0);
    expect(springProgress(2, OMEGA, ZETA)).toBe(1);
  });

  /**
   * `e^(-pi * zeta / sqrt(1 - zeta^2))`, which for the select's spring is ~11%.
   * This is the number the curve exists for: the panel arrives, goes slightly
   * past its resting size, and settles back onto it.
   */
  it("overshoots by the system's own damping ratio", () => {
    const expected = Math.exp((-Math.PI * ZETA) / Math.sqrt(1 - ZETA * ZETA));
    let peak = 0;
    for (let step = 0; step <= 1000; step++) {
      peak = Math.max(peak, springProgress(step / 1000, OMEGA, ZETA));
    }
    expect(peak - 1).toBeCloseTo(expected, 2);
  });

  /** Same closed form the `linear()` tokens are sampled from, so the two agree. */
  it("matches the overlay spring's published 1.1% overshoot", () => {
    let peak = 0;
    for (let step = 0; step <= 1000; step++) {
      peak = Math.max(peak, springProgress(step / 1000, 9.2, 0.82));
    }
    expect(peak).toBeCloseTo(1.0111, 3);
  });

  it("does not overshoot when critically damped", () => {
    for (let step = 0; step <= 100; step++) {
      expect(springProgress(step / 100, OMEGA, 1)).toBeLessThanOrEqual(1);
    }
  });
});
