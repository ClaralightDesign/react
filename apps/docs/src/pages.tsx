import type { ReactNode } from "react";
import type { Page, Section } from "./app";
import { Demo } from "./components/demo";
import { ButtonDemo } from "./demos/button";
import buttonSource from "./demos/button.tsx?raw";
import { CardDemo } from "./demos/card";
import cardSource from "./demos/card.tsx?raw";
import { DialogDemo } from "./demos/dialog";
import dialogSource from "./demos/dialog.tsx?raw";
import { InputDemo } from "./demos/input";
import inputSource from "./demos/input.tsx?raw";
import { PopoverDemo } from "./demos/popover";
import popoverSource from "./demos/popover.tsx?raw";
import { ScrollAreaDemo } from "./demos/scroll-area";
import scrollAreaSource from "./demos/scroll-area.tsx?raw";
import { SelectDemo } from "./demos/select";
import selectSource from "./demos/select.tsx?raw";
import { ShapesDemo } from "./demos/shapes";
import { TooltipDemo } from "./demos/tooltip";
import tooltipSource from "./demos/tooltip.tsx?raw";

/* ---------------------------------------------------------------------------
 * Tokens
 * ------------------------------------------------------------------------- */

interface SwatchGroup {
  label: string;
  note?: string;
  tokens: Array<[name: string, description: string]>;
}

/**
 * Groups the tokens by their role: layered translucent surfaces, foregrounds,
 * and semantic colors. Values are always read from theme.css.
 */
const SWATCHES: SwatchGroup[] = [
  {
    label: "Surface stack",
    note: "Translucent, so each layer reads correctly over the one beneath it.",
    tokens: [
      ["background", "Window / canvas"],
      ["panel", "Panes, sheets, sidebars"],
      ["frost", "Under a backdrop blur"],
      ["control", "Rows, fields, buttons"],
      ["control-highlight", "Hovered / raised"],
      ["floating", "Over arbitrary content"],
      ["selection", "Selected row / scrollbar"],
      ["track", "Recessed track"],
    ],
  },
  {
    label: "Lines",
    tokens: [
      ["separator", "Between rows and groups"],
      ["outline", "Around controls and dialogs"],
      ["outline-strong", "Around floating panels"],
    ],
  },
  {
    label: "Foreground",
    tokens: [
      ["foreground", "Titles, selected rows"],
      ["foreground-secondary", "Row and body text"],
      ["foreground-tertiary", "Subtitles, units, prefixes"],
      ["foreground-hint", "Headers, placeholders"],
      ["foreground-disabled", "Disabled"],
    ],
  },
  {
    label: "Accent",
    note: "Marks the primary action and selection — and nothing else.",
    tokens: [
      ["accent", "ClaraLight blue"],
      ["accent-background", "Fill behind emphasized actions"],
      ["on-accent", "On top of accent"],
      ["selection-accent", "Checklist and opt-in marks"],
    ],
  },
  {
    label: "Status",
    tokens: [
      ["success", "Positive"],
      ["warning", "Warning"],
      ["warning-background", "Behind a warning banner"],
      ["danger", "Destructive"],
      ["danger-background", "Behind an error badge"],
      ["on-danger", "On top of danger"],
    ],
  },
];

/**
 * Tailwind scans source text for literal class names, so `text-${step}` would
 * silently generate nothing. These maps keep the class names literal while the
 * data stays driven by the token list.
 */
const TYPE_CLASS = {
  display: "text-display",
  headline: "text-headline",
  title: "text-title",
  body: "text-body",
  callout: "text-callout",
  label: "text-label",
  caption: "text-caption",
  mono: "text-mono",
  "mono-strong": "text-mono-strong",
} as const;

const RADIUS_CLASS = {
  none: "rounded-none",
  control: "rounded-control",
  medium: "rounded-medium",
  panel: "rounded-panel",
  sheet: "rounded-sheet",
  dialog: "rounded-dialog",
  capsule: "rounded-capsule",
} as const;

const TYPE_RAMP: Array<[step: keyof typeof TYPE_CLASS, use: string]> = [
  ["display", "Hero text and brand titles (ChillDINGothic)"],
  ["headline", "Panel and sheet titles"],
  ["title", "Dialog titles and prominent rows"],
  ["body", "Default body, list rows"],
  ["callout", "Dense controls, property rows"],
  ["label", "Section headers, small buttons"],
  ["caption", "Captions and footnotes"],
  ["mono", "Dimensions, memory, time codes"],
  ["mono-strong", "Emphasised numeric values"],
];

function TokenSwatch({ name, description }: { name: string; description: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-9 w-9 shrink-0 rounded-control border border-outline"
        style={{ backgroundColor: `var(--cl-${name})` }}
      />
      <div className="min-w-0">
        <div className="truncate font-mono text-mono text-foreground-secondary">{name}</div>
        <div className="truncate text-caption text-foreground-hint">{description}</div>
      </div>
    </div>
  );
}

function TokensPage(): ReactNode {
  return (
    <div className="flex flex-col gap-8">
      {SWATCHES.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-title text-foreground">{group.label}</h2>
            {group.note ? (
              <p className="text-caption text-foreground-tertiary">{group.note}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.tokens.map(([name, description]) => (
              <TokenSwatch key={name} name={name} description={description} />
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-title text-foreground">Type ramp</h2>
          <p className="text-caption text-foreground-tertiary">
            Weights here are the design intent. MiSans ships a non-standard variable weight axis, so
            they land exactly only once the real font is loaded — see{" "}
            <code className="font-mono text-mono">fonts/README.md</code>.
          </p>
        </div>
        <div className="flex flex-col divide-y divide-separator overflow-hidden rounded-medium border border-outline">
          {TYPE_RAMP.map(([step, use]) => (
            <div key={step} className="flex items-baseline gap-4 px-4 py-3">
              <span className="w-32 shrink-0 font-mono text-mono text-foreground-hint">{step}</span>
              <span className={`${TYPE_CLASS[step]} flex-1 text-foreground`}>Aa 字体 0123</span>
              <span className="hidden text-caption text-foreground-hint sm:block">{use}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title text-foreground">Shape</h2>
        <p className="text-caption text-foreground-tertiary">
          These samples show the radius tokens as circular CSS arcs. Components apply Figma corner
          smoothing at these radii through the shared Squircle primitive; the Corner shape page
          compares the smoothing levels.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(["none", "control", "medium", "panel", "sheet", "dialog", "capsule"] as const).map(
            (radius) => (
              <div key={radius} className="flex flex-col items-center gap-2">
                <div
                  className={`h-16 w-full border border-outline bg-control ${RADIUS_CLASS[radius]}`}
                />
                <span className="font-mono text-mono text-foreground-hint">{radius}</span>
              </div>
            ),
          )}
        </div>
        <p className="text-caption text-foreground-tertiary">
          <span className="font-mono text-mono">none</span> is more than a zero: a surface that
          measures a zero radius stops generating a shape at all, and paints its border and shadow
          natively instead.
        </p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Pages
 * ------------------------------------------------------------------------- */

const componentPages: Page[] = [
  {
    id: "button",
    title: "Button",
    description: (
      <>
        The capsule control. Four variants across three densities, with the signature ClaraLight
        press: the control scales up while held and springs back on release.
      </>
    ),
    render: () => (
      <Demo
        title="Variants, sizes and states"
        hint="Hold a control down and release it slowly, then quickly — the same spring, but the overshoot scales to however far it actually travelled. A CSS transition retargets from the current computed value, so interrupting it never jumps."
        code={buttonSource}
        surface="grid"
        padding="lg"
      >
        <ButtonDemo />
      </Demo>
    ),
    install: { item: "button", exports: ["Button"] },
  },
  {
    id: "input",
    title: "Input",
    description: (
      <>
        A text field. Its fill is a translucent overlay rather than an opaque colour, which is what
        lets the same component read correctly on the window background and inside a panel.
      </>
    ),
    render: () => (
      <Demo
        title="Sizes and states"
        hint="Switch the preview surface between background, panel and grid to see the fill react to what is behind it."
        code={inputSource}
        surface="grid"
      >
        <InputDemo />
      </Demo>
    ),
    install: { item: "input", exports: ["Input"] },
  },
  {
    id: "card",
    title: "Card",
    description: (
      <>
        A surface on the layer stack. Three variants cover the three places a card can sit: on the
        window, inside a panel, or floating over arbitrary content.
      </>
    ),
    render: () => (
      <Demo
        title="Panel, frost and control"
        hint="Composed from parts, so the header, content and footer spacing stays consistent without every call site repeating it."
        code={cardSource}
        surface="background"
      >
        <CardDemo />
      </Demo>
    ),
    install: {
      item: "card",
      exports: ["Card", "CardHeader", "CardTitle", "CardDescription", "CardContent", "CardFooter"],
    },
  },
  {
    id: "dialog",
    title: "Dialog",
    description: (
      <>
        A frosted modal. Base UI owns focus trapping, scroll locking, Escape and nested dialogs;
        ClaraLight owns the surface and the entrance.
      </>
    ),
    render: () => (
      <Demo
        title="Confirmation"
        hint="The popup is carried from the trigger's own rectangle onto its final box by a projective quad — the four corners travel on four different curves — while the scrim fades on a faster one, because a slow scrim makes the page behind it feel stuck."
        code={dialogSource}
        surface="grid"
        padding="lg"
      >
        <DialogDemo />
      </Demo>
    ),
    install: {
      item: "dialog",
      exports: [
        "Dialog",
        "DialogTrigger",
        "DialogPopup",
        "DialogTitle",
        "DialogDescription",
        "DialogClose",
      ],
    },
  },
  {
    id: "select",
    title: "Select",
    description: (
      <>
        A select with a keyboard-driven popup. Typeahead, arrow navigation and Escape come from Base
        UI and drive the same highlighted state the styles target.
      </>
    ),
    render: () => (
      <Demo
        title="Trigger and popup"
        hint="The panel is clipped out of the trigger's rectangle: the box travels and grows, the rows inside it never move."
        code={selectSource}
        surface="grid"
        padding="lg"
      >
        <SelectDemo />
      </Demo>
    ),
    install: {
      item: "select",
      exports: [
        "Select",
        "SelectTrigger",
        "SelectValue",
        "SelectIcon",
        "SelectContent",
        "SelectItem",
        "SelectItemText",
        "SelectItemIndicator",
        "SelectLabel",
        "SelectGroup",
        "SelectGroupLabel",
        "SelectSeparator",
      ],
    },
  },
  {
    id: "popover",
    title: "Popover",
    description: (
      <>
        An overlay that points at what opened it. The arrow is part of the surface — one path covers
        the body and the tail — so the frost, the blur and the outline cross the join as a single
        shape.
      </>
    ),
    render: () => (
      <Demo
        title="Anchored content"
        hint="Scroll the preview: the tail slides along the edge to follow the trigger, and flips to the opposite edge when Base UI runs out of room on the preferred side."
        code={popoverSource}
        surface="grid"
        padding="lg"
      >
        <PopoverDemo />
      </Demo>
    ),
    install: {
      item: "popover",
      exports: [
        "Popover",
        "PopoverTrigger",
        "PopoverContent",
        "PopoverTitle",
        "PopoverDescription",
        "PopoverClose",
      ],
    },
  },
  {
    id: "tooltip",
    title: "Tooltip",
    description: (
      <>
        The same anchored surface, one step quieter. Hover or focus a control and its label appears
        after a short dwell — shared across a group, so scanning a toolbar does not mean waiting at
        every control.
      </>
    ),
    render: () => (
      <Demo
        title="Labels on hover"
        hint="Move along the row: one popup follows the new trigger, the label morphing as it goes. The tail leads — it reaches towards the new trigger first and holds there while the surface catches up. Tab through them to see the same on focus."
        code={tooltipSource}
        surface="grid"
        padding="lg"
      >
        <TooltipDemo />
      </Demo>
    ),
    install: {
      item: "tooltip",
      exports: ["TooltipProvider", "TooltipGroup", "Tooltip", "TooltipTrigger", "TooltipContent"],
    },
  },
  {
    id: "scroll-area",
    title: "Scroll area",
    description: (
      <>
        A viewport whose sides dissolve into the frame as more content comes into range. The
        scrolling itself is the browser's — momentum, rubber-banding, diagonal trackpad gestures and
        keyboard paging all come for free, and none of it goes through React.
      </>
    ),
    render: () => (
      <Demo
        title="Edges and scrollbars"
        hint="Scroll any of these: the fade grows out of the first 24px rather than snapping on, because the mask is built from the live distance to the edge instead of being animated towards it. The bars surface on hover or while scrolling, then fade after a beat."
        code={scrollAreaSource}
        surface="background"
        padding="lg"
      >
        <ScrollAreaDemo />
      </Demo>
    ),
    install: { item: "scroll-area", exports: ["ScrollArea"] },
  },
];

const foundationPages: Page[] = [
  {
    id: "shape",
    title: "Corner shape",
    description: (
      <>
        ClaraLight corners are smooth corners, drawn with Figma's construction rather than CSS{" "}
        <code className="font-mono text-mono">corner-shape</code> — the two are different curve
        families and do not coincide.
      </>
    ),
    render: () => <ShapesDemo />,
  },
  {
    id: "tokens",
    title: "Tokens",
    description: (
      <>
        The design language as CSS custom properties. Dark is the reference scheme and the default;
        the warm light scheme is one class away.
      </>
    ),
    render: () => <TokensPage />,
  },
];

export const sections: Section[] = [
  { label: "Components", pages: componentPages },
  { label: "Foundations", pages: foundationPages },
];
