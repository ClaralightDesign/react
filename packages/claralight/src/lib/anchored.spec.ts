import { describe, expect, it } from "vitest";
import { type AnchoredSide, type SurfaceGeometry, surfacePath, tokenNumber } from "./anchored";

/** Most cases splice the tail into one subpath, so the clip is the whole outline. */
const path = (geometry: SurfaceGeometry) => surfacePath(geometry).clip;

const BASE: SurfaceGeometry = {
  width: 200,
  height: 120,
  side: "top",
  radius: 18,
  smoothing: 0.6,
  arrow: true,
  extent: 7,
  arrowWidth: 24,
  center: 100,
};

const geometry = (overrides: Partial<SurfaceGeometry> = {}): SurfaceGeometry => ({
  ...BASE,
  ...overrides,
});

interface Point {
  x: number;
  y: number;
}

/** Absolute commands only, which is all the tail and the body's edges use. */
function points(path: string): Point[] {
  return [...path.matchAll(/[MLC]([^A-Za-z]*)/g)].flatMap((match) => {
    const numbers = ((match[1] ?? "").match(/-?\d*\.?\d+/g) ?? []).map(Number);
    const pairs: Point[] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      pairs.push({ x: numbers[i] ?? 0, y: numbers[i + 1] ?? 0 });
    }
    return pairs;
  });
}

/**
 * The tail is the only thing emitted as absolute cubics; corners stay relative.
 * Its first base point is the `L` that enters the splice, so that one comes
 * along too — otherwise the sampled tail is missing one of its two ends.
 */
function tailPoints(path: string): Point[] {
  const commands: string[] = path.match(/[A-Za-z][^A-Za-z]*/g) ?? [];
  const first = commands.findIndex((command) => command.startsWith("C"));
  if (first < 0) return [];
  // The splice is one entry line followed by exactly four cubics.
  return commands.slice(first - 1, first + 4).flatMap((command) => points(command));
}

const axis = (side: AnchoredSide) => (side === "left" || side === "right" ? "y" : "x");
const normal = (side: AnchoredSide) => (side === "left" || side === "right" ? "x" : "y");

describe("surfacePath", () => {
  it("emits one closed subpath", () => {
    const single = path(geometry());
    expect(single.match(/M/g)).toHaveLength(1);
    expect(single.endsWith("Z")).toBe(true);
  });

  it("draws no tail, and no absolute cubics, when the arrow is off", () => {
    const plain = path(geometry({ arrow: false }));
    expect(plain).not.toMatch(/C/);
    // Without a tail the body fills the whole box.
    expect(Math.max(...points(plain).map((point) => point.y))).toBeCloseTo(BASE.height, 3);
  });

  describe.each(["top", "bottom", "left", "right"] as const)("side %s", (side) => {
    const vertical = side === "left" || side === "right";
    const spliced = path(geometry({ side, center: vertical ? 60 : 100 }));
    const tail = tailPoints(spliced);

    it("splices exactly four cubic segments into the edge facing the anchor", () => {
      expect(spliced.match(/C/g)).toHaveLength(4);
      // One entry point on the edge, then three per cubic.
      expect(tail).toHaveLength(13);
    });

    it("reaches the tip exactly one extent past the body", () => {
      const span = vertical ? BASE.width : BASE.height;
      // The tail points away from the surface's centre, on the anchor's side.
      const outward = side === "top" || side === "left" ? span : 0;
      const tips = tail.map((p) => p[normal(side)]);
      const far = side === "top" || side === "left" ? Math.max(...tips) : Math.min(...tips);
      expect(far).toBeCloseTo(outward === 0 ? 0 : span, 3);
      // ...and the body stops one extent short of it.
      const bodyEdge = side === "top" || side === "left" ? span - BASE.extent : BASE.extent;
      expect(Math.min(...tail.map((p) => Math.abs(p[normal(side)] - bodyEdge)))).toBeCloseTo(0, 3);
    });

    it("centres the base on the resolved arrow position", () => {
      const center = vertical ? 60 : 100;
      const along = tail.map((p) => p[axis(side)]);
      expect(Math.min(...along)).toBeCloseTo(center - BASE.arrowWidth / 2, 3);
      expect(Math.max(...along)).toBeCloseTo(center + BASE.arrowWidth / 2, 3);
    });

    it("keeps the tail symmetric about its centre", () => {
      const center = vertical ? 60 : 100;
      const along = tail.map((p) => p[axis(side)] - center).sort((a, b) => a - b);
      for (let i = 0; i < along.length / 2; i++) {
        expect(along[i] as number).toBeCloseTo(-(along[along.length - 1 - i] as number), 6);
      }
    });
  });

  /**
   * The corner is Lisse's tangency length, `(1 + smoothing) * radius` — 28.8px
   * here — not the radius. A clamp on the radius alone leaves the base 9.8px
   * inside the curve, where the splice has to double back along the edge.
   */
  it("holds the tail clear of the corners, wherever Lisse ended them", () => {
    const clamped = path(geometry({ center: 4 }));
    const base = Math.min(...tailPoints(clamped).map((point) => point.x));
    expect(base).toBeCloseTo((1 + BASE.smoothing) * BASE.radius, 3);
  });

  /**
   * The splice replaces the edge's straight run, so both base ends have to sit
   * on it. One that reaches into a corner is emitted anyway — and the path then
   * travels back the way it came, which self-intersects the fill and strokes the
   * corner twice. Walking the edge is the test that catches it: every point the
   * path puts on the tail's edge has to advance in the edge's own direction.
   */
  describe.each(["top", "bottom", "left", "right"] as const)("side %s", (side) => {
    const vertical = side === "left" || side === "right";
    it.each([0, 1000] as const)("never doubles back along its edge, centre %i", (center) => {
      const clamped = geometry({ side, center });
      // The base sits on the body's own edge, one extent short of the tip.
      const far = side === "top" || side === "left";
      const edge = far ? (vertical ? BASE.width : BASE.height) - BASE.extent : BASE.extent;
      const walk = points(path(clamped))
        .filter((point) => Math.abs(point[normal(side)] - edge) < 0.01)
        .map((point) => point[axis(side)]);
      // Lisse winds clockwise, so two of the four edges are walked backwards.
      const forward = side === "bottom" || side === "left";
      const travelled = walk.map((value) => (forward ? value : -value));
      expect(travelled).toStrictEqual([...travelled].sort((a, b) => a - b));
      expect(travelled.length).toBeGreaterThan(4);
    });
  });

  it("centres the tail when the body is too small to hold it anywhere else", () => {
    const radius = 8;
    const width = 2 * (radius + BASE.arrowWidth / 2 + 1) - 2;
    const tail = tailPoints(path(geometry({ width, radius, center: 0 })));
    const along = tail.map((point) => point.x);
    expect((Math.min(...along) + Math.max(...along)) / 2).toBeCloseTo(width / 2, 3);
  });

  describe("an edge with no straight run left", () => {
    // A tooltip anchored left or right: the two corners meet in the middle of
    // the edge, so there is nowhere flat to splice a 24px base into.
    const short = geometry({ width: 120, height: 28, radius: 12, side: "right", center: 14 });
    const surface = surfacePath(short);
    const tail = tailPoints(surface.clip);

    it("keeps the tail, as a union rather than a splice", () => {
      expect(surface.outline).toHaveLength(2);
      expect(surface.clip).toBe(`${surface.outline[0]} ${surface.outline[1]}`);
      expect(surface.outline[1]?.startsWith("M")).toBe(true);
      expect(surface.outline[1]?.endsWith("Z")).toBe(true);
    });

    it("still reaches exactly one extent past the body", () => {
      // side right: the tail is on the body's left edge and points at x = 0.
      expect(Math.min(...tail.map((point) => point.x))).toBeCloseTo(0, 3);
    });

    it("sinks the base under the body so the join has no step", () => {
      const along = tail.map((point) => point.y);
      const ends = tail.filter(
        (point) => point.y === Math.min(...along) || point.y === Math.max(...along),
      );
      // The body's own edge is one extent in; the base sits behind it.
      expect(Math.max(...ends.map((point) => point.x))).toBeGreaterThan(short.extent);
    });

    it("narrows the tail rather than burying it", () => {
      const along = tail.map((point) => point.y);
      const width = Math.max(...along) - Math.min(...along);
      expect(width).toBeLessThan(short.arrowWidth);
      // Still a tail, not a spike: wider than it is tall.
      expect(width).toBeGreaterThan(short.extent);
    });

    it("winds the tail the same way as the body, so the clip unions them", () => {
      const direction = (subpath: string) => {
        const polygon = points(subpath);
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
          const from = polygon[i] as Point;
          const to = polygon[(i + 1) % polygon.length] as Point;
          area += (to.x - from.x) * (to.y + from.y);
        }
        return Math.sign(area);
      };
      expect(direction(surface.outline[1] as string)).toBe(direction(surface.outline[0] as string));
    });
  });

  /**
   * What the motion track asks for while a shared tooltip moves between
   * triggers: the resting centre plus the travel the surface has left, so the
   * tail stays on the new trigger while the body is still on its way. The
   * surface answers with the most of that it can draw, which is what gives the
   * movement its three beats — lead out to the limit, ride there, then hold
   * still while the body arrives.
   */
  describe("a tail leading a surface that is still travelling", () => {
    const resting = 100;
    const drawn = (travel: number) => surfacePath(geometry({ center: resting + travel })).center;
    const run = { start: (1 + BASE.smoothing) * BASE.radius, end: 0 };
    run.end = BASE.width - run.start;

    it("goes as far towards the new anchor as the edge allows", () => {
      expect(drawn(400)).toBeCloseTo(run.end - BASE.arrowWidth / 2, 3);
      expect(drawn(-400)).toBeCloseTo(run.start + BASE.arrowWidth / 2, 3);
    });

    /**
     * And says so, because the track has to aim its follower at the limit rather
     * than at the anchor: a step of 60% of a 180px ask lands on the limit in one
     * frame, which is a jump. Aimed at the limit, the same step is a slide.
     */
    it("reports the reach it clamped to, not only the answer", () => {
      const { range } = surfacePath(geometry());
      expect(range.min).toBeCloseTo(run.start + BASE.arrowWidth / 2, 3);
      expect(range.max).toBeCloseTo(run.end - BASE.arrowWidth / 2, 3);
      expect(drawn(400)).toBeCloseTo(range.max, 3);
      expect(drawn(-400)).toBeCloseTo(range.min, 3);
    });

    it("stays parked there rather than drifting, however far the ask goes", () => {
      expect(drawn(400)).toBeCloseTo(drawn(4000), 3);
    });

    it("follows the ask once the surface has closed the distance", () => {
      expect(drawn(40)).toBeCloseTo(resting + 40, 3);
      expect(drawn(0)).toBeCloseTo(resting, 3);
    });

    it("keeps the whole base on the run at every point of the way", () => {
      for (let travel = -400; travel <= 400; travel += 7) {
        expect(drawn(travel) - BASE.arrowWidth / 2).toBeGreaterThanOrEqual(run.start - 0.001);
        expect(drawn(travel) + BASE.arrowWidth / 2).toBeLessThanOrEqual(run.end + 0.001);
      }
    });
  });

  describe("the entrance origin", () => {
    it.each([
      ["top", { x: 100, y: 120 }],
      ["bottom", { x: 100, y: 0 }],
      ["left", { x: 200, y: 60 }],
      ["right", { x: 0, y: 60 }],
    ] as const)("%s grows from the tail's tip", (side, expected) => {
      const vertical = side === "left" || side === "right";
      const { origin } = surfacePath(geometry({ side, center: vertical ? 60 : 100 }));
      expect(origin.x).toBeCloseTo(expected.x, 3);
      expect(origin.y).toBeCloseTo(expected.y, 3);
    });

    it("follows the clamped tail, not the requested centre", () => {
      const surface = surfacePath(geometry({ center: 4 }));
      const clamped = (1 + BASE.smoothing) * BASE.radius + BASE.arrowWidth / 2;
      expect(surface.center).toBeCloseTo(clamped, 3);
      expect(surface.origin.x).toBeCloseTo(clamped, 3);
    });
  });
});

describe("tokenNumber", () => {
  it.each([
    ["450ms", 450],
    ["500ms", 500],
    ["4px", 4],
    ["-1.5rem", -1.5],
    ["0s", 0],
    ["1.0111", 1.0111],
  ])("reads %s", (value, expected) => {
    expect(tokenNumber(value)).toBeCloseTo(expected, 6);
  });

  it.each([["auto"], ["none"], ["calc(4px + 2px)"], [""]])("has no number in %s", (value) => {
    expect(tokenNumber(value)).toBeUndefined();
  });

  /**
   * The build minifies `450ms` to `.45s`, which is the whole reason this is not
   * a bare `parseFloat`: read as 0.45 the tooltip's dwell has already elapsed by
   * the time the pointer settles, and the tooltip opens on the spot.
   */
  it("converts seconds, so a minified duration is not read as milliseconds", () => {
    expect(tokenNumber(".45s")).toBe(450);
    expect(tokenNumber("450ms")).toBe(450);
  });
});
