import { cn } from "@claralight/react";
import { type ReactNode, useState } from "react";

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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded webviews.
      setCopied(false);
    }
  }

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
            onClick={copy}
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
          <div className={cn(surfaces[surface], padding === "lg" ? "p-8" : "p-6")}>{children}</div>
        ) : (
          <pre className="max-h-96 overflow-auto bg-background p-4 font-mono text-mono text-foreground-secondary">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </section>
  );
}
