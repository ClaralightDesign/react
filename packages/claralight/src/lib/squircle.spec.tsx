import { createRef, Fragment, type RefCallback } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Card } from "../ui/card";
import { composeRefs, Squircle } from "./squircle";

describe("Squircle refs", () => {
  it("attaches internal, consumer and child refs to the same node", () => {
    const internal = createRef<HTMLDivElement>();
    const consumer = createRef<HTMLDivElement>();
    const child = vi.fn();
    const node = {} as HTMLDivElement;
    const cleanup = composeRefs(internal, consumer, child)(node);
    expect(internal.current).toBe(node);
    expect(consumer.current).toBe(node);
    expect(child).toHaveBeenCalledExactlyOnceWith(node);
    if (typeof cleanup !== "function") throw new Error("Missing ref cleanup");
    cleanup();
    expect(internal.current).toBeNull();
    expect(consumer.current).toBeNull();
    expect(child).toHaveBeenLastCalledWith(null);
  });

  it("calls React 19 ref cleanup instead of also passing null", () => {
    const cleanup = vi.fn();
    const callback = vi.fn<RefCallback<HTMLDivElement>>(() => cleanup);
    const object = createRef<HTMLDivElement>();
    const detach = composeRefs(undefined, callback, object)({} as HTMLDivElement);
    if (typeof detach !== "function") throw new Error("Missing ref cleanup");
    detach();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
    expect(object.current).toBeNull();
  });

  it("supports the attach/cleanup/attach StrictMode cycle", () => {
    const object = createRef<HTMLDivElement>();
    const cleanup = vi.fn();
    const callback = vi.fn<RefCallback<HTMLDivElement>>(() => cleanup);
    const merged = composeRefs(object, callback);
    const node = {} as HTMLDivElement;
    const detach = merged(node);
    if (typeof detach === "function") detach();
    expect(object.current).toBeNull();
    const nextDetach = merged(node);
    expect(object.current).toBe(node);
    expect(callback).toHaveBeenCalledTimes(2);
    if (typeof nextDetach === "function") nextDetach();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});

describe("Squircle SSR", () => {
  it("retains a CSS-only radius fallback when Card forwards style/ref", () => {
    const ref = createRef<HTMLDivElement>();
    const html = renderToString(
      <Card ref={ref} radius="panel" style={{ color: "red", padding: 13 }}>
        Content
      </Card>,
    );
    expect(html).toContain("border-radius:var(--radius-panel)");
    expect(html).toContain("color:red");
    expect(html).toContain("padding:13px");
    expect(html).toContain('data-cl-squircle="panel"');
    expect(html).not.toContain("clip-path");
    expect(ref.current).toBeNull();
  });

  it("merges child style and classes without removing the fallback", () => {
    const html = renderToString(
      <Squircle radius="control" asChild className="p-2" style={{ color: "red" }}>
        <button type="button" className="p-4" style={{ color: "blue", opacity: 0.5 }}>
          Child
        </button>
      </Squircle>,
    );
    expect(html).toContain("border-radius:var(--radius-control)");
    expect(html).toContain("color:blue");
    expect(html).toContain("opacity:0.5");
    expect(html).toContain('class="p-4"');
    expect(html).toContain("<button");
  });

  it("honours a deliberately supplied border radius", () => {
    const html = renderToString(
      <Squircle radius="control" style={{ borderRadius: "1rem" }}>
        Content
      </Squircle>,
    );
    expect(html).toContain("border-radius:1rem");
    expect(html).toContain("--cl-squircle-radius:1rem");
  });

  it("keeps the SSR fallback when borderRadius is explicitly undefined", () => {
    const html = renderToString(
      <Squircle radius="panel" style={{ borderRadius: undefined, color: "red" }} />,
    );
    expect(html).toContain("border-radius:var(--radius-panel)");
    expect(html).toContain("color:red");
  });

  it("keeps the fallback when an asChild style contains an undefined radius", () => {
    const html = renderToString(
      <Squircle radius="medium" asChild>
        <button type="button" style={{ borderRadius: undefined }} />
      </Squircle>,
    );
    expect(html).toContain("border-radius:var(--radius-medium)");
  });

  it("uses the child's uniform numeric radius for the shape and wrapper", () => {
    const html = renderToString(
      <Squircle radius="medium" asChild style={{ borderRadius: "1rem" }}>
        <button type="button" style={{ borderRadius: 24 }} />
      </Squircle>,
    );
    expect(html).toContain("border-radius:24px");
    expect(html).toContain("--cl-squircle-radius:24px");
  });

  it("rejects children that cannot receive the shape ref", () => {
    expect(() =>
      renderToString(
        <Squircle radius="control" asChild>
          text
        </Squircle>,
      ),
    ).toThrow("non-Fragment React element");
    expect(() =>
      renderToString(
        <Squircle radius="control" asChild>
          <Fragment key="invalid-ref-target">
            <span />
          </Fragment>
        </Squircle>,
      ),
    ).toThrow("non-Fragment React element");
  });
});
