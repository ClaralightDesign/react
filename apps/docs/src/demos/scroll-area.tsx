import { Card, ScrollArea } from "@claralight-design/react";

const ROWS = [
  ["Aperture", "f/1.78"],
  ["Shutter", "1/125 s"],
  ["Sensitivity", "ISO 400"],
  ["Focal length", "35 mm"],
  ["White balance", "5200 K"],
  ["Exposure bias", "−0.3 EV"],
  ["Metering", "Centre-weighted"],
  ["Colour profile", "Display P3"],
  ["Bit depth", "14-bit"],
  ["Lens correction", "Applied"],
  ["Noise reduction", "Low"],
  ["Sharpening", "Capture only"],
];

const COLUMNS = ["Frame", "Aperture", "Shutter", "ISO", "Focal", "Balance", "Profile"];

/**
 * Every one of these scrolls without React rendering a frame.
 *
 * Base UI reports the distance from each edge as a live CSS variable, and the
 * fade is a mask built straight off it — so the band grows out of the first
 * `--cl-scroll-edge` pixels of scroll rather than being animated towards a
 * target. The blur behind it cross-fades on the boolean instead, because a
 * `backdrop-filter` layer is only worth compositing while its edge is live.
 */
export function ScrollAreaDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* The size goes on the surface: the viewport fills it absolutely, so a
          surface left to size itself to its content would have no height. */}
      <ScrollArea orientation="vertical" className="h-64 border border-outline bg-panel">
        <div className="flex flex-col divide-y divide-separator">
          {ROWS.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-callout text-foreground-secondary">{label}</span>
              <span className="font-mono text-mono text-foreground">{value}</span>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/*
        `both` is the default and matches the Flutter widget: each enabled axis
        leaves the content unconstrained, so the grid below is free to be wider
        than the frame and there is something to scroll diagonally.
      */}
      <ScrollArea className="h-64 border border-outline bg-panel">
        <div className="grid w-max grid-cols-7">
          {COLUMNS.map((column) => (
            <div
              key={column}
              className="border-separator border-b px-4 py-2 text-label text-foreground-hint"
            >
              {column}
            </div>
          ))}
          {ROWS.map(([label, value], row) =>
            COLUMNS.map((column, index) => (
              <div
                key={`${label}-${column}`}
                className="px-4 py-2 font-mono text-mono text-foreground-secondary"
              >
                {index === 0 ? `#${String(row + 1).padStart(3, "0")}` : value}
              </div>
            )),
          )}
        </div>
      </ScrollArea>

      {/*
        The cheap tier, side by side with the full one. `mask` keeps the fade —
        a compositor-only effect — and drops the three backdrop-filter layers
        per edge, which is the whole cost of the treatment.
      */}
      <Card variant="control" wrapperClassName="sm:col-span-2" className="p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["blur", "mask"] as const).map((edge) => (
            <div key={edge} className="flex flex-col gap-2">
              <span className="px-1 text-label text-foreground-hint">edge=&quot;{edge}&quot;</span>
              <ScrollArea
                orientation="vertical"
                edge={edge}
                scrollbars="always"
                radius="control"
                className="h-40 bg-panel"
                contentClassName="p-3"
              >
                <p className="text-callout text-foreground-secondary leading-relaxed">
                  The edge treatment is not decoration — it is the only thing telling you the frame
                  is a window rather than the end of the content. Scroll this and watch the top
                  dissolve as soon as there is anything behind it. With{" "}
                  <code className="font-mono text-mono">blur</code> the last few pixels smear into
                  the frame as well, which is what a shader does in one pass and the web does with
                  three stacked layers. With <code className="font-mono text-mono">mask</code> only
                  the fade survives, and nothing has to re-read the backdrop while you scroll. Both
                  bands are <code className="font-mono text-mono">--cl-scroll-edge</code> wide, and
                  setting one side to zero removes it entirely.
                </p>
              </ScrollArea>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
