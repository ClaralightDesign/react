import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Slider } from "../ui/slider";

describe("Slider SSR & Accessibility", () => {
  it("renders a slider role with correct default aria attributes", () => {
    const html = renderToString(<Slider value={0.4} min={0} max={1} />);
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuenow="0.4"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="1"');
    expect(html).toContain('aria-orientation="horizontal"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("aria-disabled");
  });

  it("formats value label in aria-valuetext", () => {
    const html = renderToString(
      <Slider
        value={0.75}
        min={0}
        max={1}
        valueLabel={(v) => `${Math.round(v * 100)}%`}
      />,
    );
    expect(html).toContain('aria-valuetext="75%"');
  });

  it("handles disabled state properly", () => {
    const html = renderToString(<Slider value={0.5} disabled />);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('tabindex="0"');
    expect(html).toContain("cursor-default");
  });

  it("supports defaultValue for uncontrolled slider", () => {
    const html = renderToString(<Slider defaultValue={0.8} min={0} max={1} />);
    expect(html).toContain('aria-valuenow="0.8"');
  });

  it("applies custom className", () => {
    const html = renderToString(<Slider value={0.2} className="custom-slider" />);
    expect(html).toContain("custom-slider");
    expect(html).toContain("h-control-md");
  });

  it("renders broken rail segments and dots for snapPoints", () => {
    const html = renderToString(
      <Slider value={0.5} min={0} max={1} snapPoints={[0, 0.5, 1]} />,
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain("rounded-full");
  });

  it("handles custom range and negative min/max", () => {
    const html = renderToString(
      <Slider
        value={-0.5}
        min={-1}
        max={1}
        valueLabel={(v) => `Val: ${v}`}
      />,
    );
    expect(html).toContain('aria-valuenow="-0.5"');
    expect(html).toContain('aria-valuemin="-1"');
    expect(html).toContain('aria-valuemax="1"');
    expect(html).toContain('aria-valuetext="Val: -0.5"');
  });

  it("supports step grid and snaps values to step stops", () => {
    const html = renderToString(
      <Slider
        value={3}
        min={1}
        max={5}
        step={1}
        valueLabel={(v) => `${v} 档`}
      />,
    );
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuetext="3 档"');
  });
});
