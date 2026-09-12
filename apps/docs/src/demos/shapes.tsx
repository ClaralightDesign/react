import { cn, ScrollArea } from "@claralight/react";
import { useSmoothCorners } from "@lisse/react";
import { useRef } from "react";

/**
 * Side-by-side corner shapes, for design review.
 *
 * The web has two unrelated curve families for smooth corners and they do not
 * coincide, so this page exists to make the choice *visible* rather than
 * arguable:
 *
 *   ξ = 0            a plain circular arc, identical to `border-radius`
 *   ξ = 0.6          Figma's default — what the design tools draw, and the same
 *                    construction family as Apple's `cornerCurve = .continuous`
 *   ξ = 1            no circular arc left at all, only the Bezier shoulders
 *   border-radius    the circular control, for reference
 *
 * ClaraLight ships ξ = 0.6 (`--cl-corner-smoothing`). Note that CSS
 * `corner-shape: superellipse(2)` — which Chromium renders natively — is a
 * *third* curve, a true Lamé superellipse, and is deliberately not used here.
 */
function CornerSample({
  radius,
  smoothing,
  label,
  note,
}: {
  radius: number;
  smoothing: number;
  label: string;
  note: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSmoothCorners(ref, { radius, smoothing });

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={ref}
        style={{ borderRadius: radius }}
        className="cl-preview-grid flex h-32 items-end border border-outline bg-control p-3"
      >
        <span className="font-mono text-mono text-foreground-secondary">{label}</span>
      </div>
      <p className="text-caption text-foreground-hint">{note}</p>
    </div>
  );
}

export function ShapesDemo() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h3 className="text-title text-foreground">Smoothing at radii.sheet (36px)</h3>
        <p className="text-caption text-foreground-tertiary">
          The largest radius in the language, so the curve difference is at its clearest. Check the
          45° diagonal of the top-left corner — that is where the families separate most.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CornerSample radius={36} smoothing={0} label="ξ 0" note="Circular arc = border-radius" />
          <CornerSample radius={36} smoothing={0.3} label="ξ 0.3" note="Gentle." />
          <CornerSample
            radius={36}
            smoothing={0.6}
            label="ξ 0.6"
            note="Figma default — ClaraLight ships this"
          />
          <CornerSample radius={36} smoothing={1} label="ξ 1" note="Beziers only, no arc" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-title text-foreground">Radius ladder at ξ 0.6</h3>
        <p className="text-caption text-foreground-tertiary">
          How much the smoothing is worth depends on the radius. At radii.control the two curves are
          about a pixel apart, which is why small controls read the same either way; at dialog it is
          several pixels.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CornerSample
            radius={8}
            smoothing={0.6}
            label="control 8px"
            note="~1px apart from circular"
          />
          <CornerSample radius={12} smoothing={0.6} label="medium 12px" note="~2px apart" />
          <CornerSample radius={18} smoothing={0.6} label="panel 18px" note="~3px apart" />
          <CornerSample radius={36} smoothing={0.6} label="dialog 36px" note="~7px apart" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-title text-foreground">The curve, measured</h3>
        <p className="text-caption text-foreground-tertiary">
          Every ClaraLight corner consumes{" "}
          <code className="font-mono text-mono">p = (1 + ξ) · R</code> of edge length before the
          straight run begins, and leaves an arc of{" "}
          <code className="font-mono text-mono">90 · (1 − ξ)</code> degrees. So a 36px corner at ξ
          0.6 starts its curve 57.6px from the corner and keeps a 36° arc — verifiable in the
          generated <code className="font-mono text-mono">clip-path</code> on any element below.
        </p>
        {/* Horizontal only: the viewport needs a definite size on an axis it
            actually scrolls, so the surface can still take its height from the
            lines inside it — and a scrollable inline axis leaves the content box
            `max-content` wide, which is what keeps this measured output on one
            line each and scrolls it rather than reflowing it. */}
        <ScrollArea
          orientation="horizontal"
          className={cn(
            "border border-outline bg-panel",
            "font-mono text-mono text-foreground-tertiary",
          )}
          contentClassName="p-4"
        >
          <div>p = (1 + 0.6) × 36 = 57.6px of edge consumed per corner</div>
          <div>arcMeasure = 90 × (1 − 0.6) = 36°</div>
          <div>native corner-shape: superellipse(2) → n = 4 Lamé curve, a different family</div>
        </ScrollArea>
      </div>
    </div>
  );
}
