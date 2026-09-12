import { cn, ScrollArea } from "@claralight-design/react";
import { type ReactNode, useMemo, useState } from "react";
import { highlight } from "../lib/prism";
import { useCopy } from "./use-copy";

export interface DemoProps {
  /** Heading above the block. */
  title: string;
  /** One line on what the block is demonstrating or why it works that way. */
  hint?: ReactNode;
  /**
   * Exact source of the demo, imported with `?raw` from the file in
   * `src/demos/`. Importing the real file rather than pasting a copy is the
   * point: the displayed code cannot drift from the code that runs.
   */
  code: string;
  /**
   * Which layer of the surface stack to preview against. ClaraLight fills are
   * translucent, so a control genuinely looks different over `background` than
   * over `panel` — and `grid` makes that visible.
   */
  surface?: "background" | "panel" | "grid";
  /** Preview area padding; dialogs and selects want more room. */
  padding?: "md" | "lg";
  children: ReactNode;
}

const surfaces = {
  background: "bg-background",
  panel: "bg-panel",
  grid: "cl-preview-grid bg-background",
} as const;

export function Demo({
  title,
  hint,
  code,
  surface = "background",
  padding = "md",
  children,
}: DemoProps) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, copy] = useCopy();
  // The source is a module constant, so each demo is tokenized once per session
  // rather than on every tab flip.
  const html = useMemo(() => highlight(code), [code]);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title text-foreground">{title}</h2>
        {hint ? <p className="text-caption text-foreground-tertiary">{hint}</p> : null}
      </div>

      <div className="overflow-hidden rounded-medium border border-outline">
        <div className="flex items-center justify-between gap-2 border-outline border-b bg-panel px-2 py-1">
          <div className="flex items-center gap-0.5">
            {(["preview", "code"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cn(
                  "cl-focus rounded-[6px] px-2 py-1 text-caption capitalize",
                  "transition-colors duration-[140ms] ease-cl-out",
                  tab === id
                    ? "bg-selection text-foreground"
                    : "text-foreground-hint hover:bg-control hover:text-foreground-tertiary",
                )}
              >
                {id}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => copy(code)}
            className={cn(
              "cl-focus rounded-[6px] px-2 py-1 text-caption",
              "text-foreground-hint transition-colors duration-[140ms] ease-cl-out",
              "hover:bg-control hover:text-foreground-tertiary",
            )}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {tab === "preview" ? (
          <div
            className={cn(
              surfaces[surface],
              // A phone cannot spare the desktop gutter, so the preview well
              // keeps its breathing room only once there is room to give.
              padding === "lg" ? "p-4 sm:p-8" : "p-4 sm:p-6",
            )}
          >
            {children}
          </div>
        ) : (
          // A definite height, not `max-h-96`: the viewport takes its height
          // from the surface, so a surface sized by its content never overflows
          // and never scrolls. Every snippet here is a whole demo file, so the
          // pane was always at its cap anyway — it just caps lower on a phone,
          // where 384px of code is most of the screen.
          <ScrollArea
            className="h-72 bg-background sm:h-96"
            contentClassName="p-4"
            style={{ borderRadius: 0 }}
          >
            {/*
              Prism returns markup, not elements. The input is a `?raw` import of
              a file in this repository — not user content — and Prism escapes
              the source text it wraps, so there is nothing here to inject.
            */}
            <pre className="font-mono text-mono text-foreground-secondary">
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
          </ScrollArea>
        )}
      </div>
    </section>
  );
}
