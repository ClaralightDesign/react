import { cn, ScrollArea } from "@claralight-design/react";
import { useState } from "react";
import { highlight } from "../lib/prism";
import { useCopy } from "./use-copy";

/**
 * The install block under each component.
 *
 * Two routes, because the project ships two: copy the source in with the shadcn
 * CLI, or install the published package. The tab bar picks the package manager
 * for both of them — a reader who chose `bun` for the registry command did not
 * mean to go back to pnpm two lines further down.
 */

/**
 * Kept in step with `shadcn` in the workspace catalog and the README. Pinning
 * the CLI in a copyable command matters more than it looks: the registry JSON
 * under `public/r/` is built against this major, and a floating `shadcn@latest`
 * is how a consumer ends up debugging a schema the registry never targeted.
 */
const SHADCN = "shadcn@4.21.0";

/**
 * `exec` runs the CLI without installing it; `add` installs a dependency. The
 * two are not the same word in any of these tools, and npm is the odd one on
 * both axes — `npx` rather than a `dlx` subcommand, `install` rather than `add`.
 */
const RUNNERS = {
  pnpm: { exec: `pnpm dlx ${SHADCN} add`, add: "pnpm add" },
  npm: { exec: `npx ${SHADCN} add`, add: "npm install" },
  yarn: { exec: `yarn dlx ${SHADCN} add`, add: "yarn add" },
  bun: { exec: `bunx ${SHADCN} add`, add: "bun add" },
} as const;

type Runner = keyof typeof RUNNERS;

const RUNNER_IDS = Object.keys(RUNNERS) as Runner[];

export interface InstallProps {
  /** Registry item name, as it appears in `registry.json` — e.g. `button`. */
  item: string;
  /**
   * The named exports this component contributes to `@claralight-design/react`,
   * for the package route's import line.
   */
  exports: string[];
}

/**
 * A mono command row with its own copy button. `tsx` highlights the line; the
 * shell rows stay plain, because the TSX lexer has nothing true to say about a
 * shell command and would only tint the version number in `shadcn@4.21.0`.
 */
function CommandRow({
  command,
  label,
  tsx = false,
}: {
  command: string;
  label: string;
  tsx?: boolean;
}) {
  const [copied, copy] = useCopy();

  return (
    <div className="flex items-stretch gap-1 bg-background">
      {/*
        The command is one long line on a phone, so it scrolls on the inline
        axis rather than wrapping: a wrapped shell command reads as two
        commands. The copy button is what a narrow screen actually uses anyway.
      */}
      <ScrollArea
        orientation="horizontal"
        scrollbars="auto"
        wrapperClassName="min-w-0 flex-1"
        contentClassName="px-3 py-2.5"
        style={{ borderRadius: 0 }}
      >
        {tsx ? (
          <code
            className="whitespace-pre font-mono text-mono text-foreground-secondary"
            dangerouslySetInnerHTML={{ __html: highlight(command) }}
          />
        ) : (
          <code className="whitespace-pre font-mono text-mono text-foreground-secondary">
            {command}
          </code>
        )}
      </ScrollArea>
      <button
        type="button"
        onClick={() => copy(command)}
        aria-label={`Copy the ${label} command`}
        className={cn(
          "cl-focus my-1.5 mr-1.5 shrink-0 self-center rounded-[6px] px-2 py-1",
          "text-caption text-foreground-hint",
          "transition-colors duration-[140ms] ease-cl-out",
          "hover:bg-control hover:text-foreground-tertiary",
        )}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Install({ item, exports }: InstallProps) {
  const [runner, setRunner] = useState<Runner>("pnpm");
  const { exec, add } = RUNNERS[runner];

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <h2 className="text-title text-foreground">Install</h2>
        <p className="text-caption text-foreground-tertiary">
          Copy the source in with the shadcn CLI. It pulls the shared files and dependencies this
          component needs and adds the theme imports — point the{" "}
          <code className="font-mono text-mono">@claralight</code> registry at{" "}
          <code className="font-mono text-mono">public/r/</code> in{" "}
          <code className="font-mono text-mono">components.json</code> first; the README has the
          block.
        </p>
      </div>

      <div className="overflow-hidden rounded-medium border border-outline">
        <div className="flex items-center gap-0.5 border-outline border-b bg-panel px-2 py-1">
          {RUNNER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRunner(id)}
              aria-pressed={runner === id}
              className={cn(
                "cl-focus rounded-[6px] px-2 py-1 font-mono text-mono",
                "transition-colors duration-[140ms] ease-cl-out",
                runner === id
                  ? "bg-selection text-foreground"
                  : "text-foreground-hint hover:bg-control hover:text-foreground-tertiary",
              )}
            >
              {id}
            </button>
          ))}
        </div>

        <CommandRow command={`${exec} @claralight/${item}`} label="registry" />

        <div className="border-outline border-t bg-panel px-3 py-2.5">
          <span className="text-label text-foreground-hint">Or install the package</span>
        </div>
        <CommandRow command={`${add} @claralight-design/react`} label="package" />

        <p className="border-outline border-t bg-panel px-3 py-2.5 text-caption text-foreground-tertiary">
          Import <code className="font-mono text-mono">@claralight-design/react/styles.css</code>{" "}
          once beside Tailwind, then:
        </p>
        <CommandRow
          command={`import { ${exports.join(", ")} } from "@claralight-design/react";`}
          label="import"
          tsx
        />
      </div>
    </section>
  );
}
