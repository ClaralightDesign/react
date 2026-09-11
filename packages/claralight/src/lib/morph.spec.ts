import { describe, expect, it } from "vitest";
import {
  homographyMatrix,
  type MorphBox,
  type MorphMatrix,
  type MorphPoint,
  type MorphQuad,
  type MorphRect,
  morphMatrix,
  morphQuad,
} from "./morph";

const BOX: MorphBox = { width: 512, height: 256 };

/** The source rectangle in the box's own coordinates: a 120x36 trigger at (40, 300). */
const SOURCE: MorphRect = { x: 40, y: 300, width: 120, height: 36 };

/**
 * `matrix3d()` as the browser applies it: a row vector against the matrix, so the
 * translation is at 12..14 and the perspective terms are at 3 and 7. The test
 * reads the matrix the way the browser does rather than the way the
 * implementation happens to have laid its array out — which is the whole point
 * of this file, since the two conventions are transposes of each other.
 */
function project(matrix: MorphMatrix, point: MorphPoint): MorphPoint {
  const [m11, m12, , m14, m21, m22, , m24, , , , , m41, m42] = matrix;
  const w = m14 * point.x + m24 * point.y + 1;
  return {
    x: (m11 * point.x + m21 * point.y + m41) / w,
    y: (m12 * point.x + m22 * point.y + m42) / w,
  };
}

const cornersOf = (rect: MorphRect): MorphQuad => [
  { x: rect.x, y: rect.y },
  { x: rect.x + rect.width, y: rect.y },
  { x: rect.x, y: rect.y + rect.height },
  { x: rect.x + rect.width, y: rect.y + rect.height },
];

const cornersOfBox = (box: MorphBox): MorphQuad => cornersOf({ ...box, x: 0, y: 0 });

/** Every corner of the box, carried by the matrix. */
const carried = (matrix: MorphMatrix, box: MorphBox): MorphQuad =>
  cornersOfBox(box).map((point) => project(matrix, point)) as MorphQuad;

/** Both sides rounded to a millionth, so float noise is not what a failure says. */
const settled = (points: MorphQuad) =>
  points.map((point) => ({
    x: Number(point.x.toFixed(6)),
    y: Number(point.y.toFixed(6)),
  }));

describe("homographyMatrix", () => {
  it("is the identity when the quad is the box", () => {
    const quad: MorphQuad = [
      { x: 0, y: 0 },
      { x: BOX.width, y: 0 },
      { x: 0, y: BOX.height },
      { x: BOX.width, y: BOX.height },
    ];
    expect(homographyMatrix(BOX, quad)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("translates when the quad is the box, moved", () => {
    const quad: MorphQuad = [
      { x: -40, y: 12 },
      { x: BOX.width - 40, y: 12 },
      { x: -40, y: BOX.height + 12 },
      { x: BOX.width - 40, y: BOX.height + 12 },
    ];
    expect(carried(homographyMatrix(BOX, quad), BOX)).toEqual(
      cornersOf({ x: -40, y: 12, width: BOX.width, height: BOX.height }),
    );
  });

  it("lands all four corners on an irregular quad", () => {
    const quad: MorphQuad = [
      { x: 12, y: -8 },
      { x: 300, y: 24 },
      { x: -30, y: 190 },
      { x: 360, y: 240 },
    ];
    expect(settled(carried(homographyMatrix(BOX, quad), BOX))).toEqual(settled(quad));
  });

  it("keeps the perspective terms non-zero for a trapezoid", () => {
    // The signature of a real quad warp: without an m14/m24 term the transform is
    // affine, and four corners can then only ever move as a parallelogram.
    const trapezoid: MorphQuad = [
      { x: 100, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 200 },
      { x: 512, y: 200 },
    ];
    const matrix = homographyMatrix(BOX, trapezoid);
    expect(Math.abs(matrix[3]) + Math.abs(matrix[7])).toBeGreaterThan(0.0001);
  });

  it("survives a degenerate quad instead of returning NaN", () => {
    const flat: MorphQuad = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(homographyMatrix(BOX, flat).every(Number.isFinite)).toBe(true);
    expect(homographyMatrix({ width: 0, height: 0 }, flat)).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]);
  });
});

describe("morphQuad", () => {
  it("starts at the source and ends at the box", () => {
    expect(settled(morphQuad(BOX, SOURCE, 0))).toEqual(settled(cornersOf(SOURCE)));
    expect(settled(morphQuad(BOX, SOURCE, 1))).toEqual(settled(cornersOfBox(BOX)));
  });

  it("is the identity matrix at rest, so the inline geometry can be dropped", () => {
    expect(morphMatrix(BOX, SOURCE, 1)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("lands on the source rectangle at progress 0, so the layer grows out of the trigger", () => {
    expect(settled(carried(morphMatrix(BOX, SOURCE, 0), BOX))).toEqual(settled(cornersOf(SOURCE)));
  });

  it("moves the corners on curves of their own", () => {
    // Four journeys of four different lengths. The corners must not be moving in
    // step, or the quad is only ever a translating rectangle.
    const source: MorphRect = { x: 20, y: 10, width: 200, height: 80 };
    const quad = morphQuad(BOX, source, 0.5);
    const from = cornersOf(source);
    const to = cornersOfBox(BOX);
    const travelled = (index: 0 | 1 | 2 | 3) =>
      Math.hypot(quad[index].x - from[index].x, quad[index].y - from[index].y) /
      Math.hypot(to[index].x - from[index].x, to[index].y - from[index].y);
    // Top-left has the shortest journey and bottom-right the longest, so the
    // corner that barely moves lags the one that crosses the box.
    expect(travelled(0)).toBeGreaterThan(0);
    expect(travelled(1)).toBeGreaterThan(travelled(0));
    expect(travelled(3)).toBeGreaterThan(travelled(2));
    expect(travelled(0)).toBeLessThan(1);
  });

  it("never travels past its target", () => {
    // Monotone corner curves are what keep the layer a downscale throughout: on
    // Safari Lisse's clip-path raster is cached at layout size and upsamples.
    const quad = morphQuad(BOX, { x: 20, y: 20, width: 100, height: 60 }, 1);
    expect(settled(quad)).toEqual(settled(cornersOfBox(BOX)));
  });

  it("grows from its own middle when there is no source", () => {
    const orphan = morphQuad(BOX, null, 0);
    const width = orphan[1].x - orphan[0].x;
    const height = orphan[2].y - orphan[0].y;
    expect(width / BOX.width).toBeCloseTo(0.3, 6);
    expect(height / BOX.height).toBeCloseTo(0.3, 6);
    expect(orphan[0].x + width / 2).toBeCloseTo(BOX.width / 2, 6);
    expect(orphan[0].y + height / 2).toBeCloseTo(BOX.height / 2, 6);
  });

  it("holds the ends beyond the progress range", () => {
    expect(morphQuad(BOX, SOURCE, -1)).toEqual(morphQuad(BOX, SOURCE, 0));
    expect(morphQuad(BOX, SOURCE, 2)).toEqual(morphQuad(BOX, SOURCE, 1));
  });
});
