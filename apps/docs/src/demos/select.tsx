import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@claralight-design/react";

const fonts = {
  sans: "Sans-serif",
  serif: "Serif",
  mono: "Monospace",
  cursive: "Cursive",
};

const densities = {
  Small: "Small",
  Medium: "Medium",
  Large: "Large",
} as const;

const fills = {
  numeric: "Numeric fill",
  image: "Image fill",
  sequence: "Frame sequence",
};

const formats = {
  short: "00:00",
  long: "00:00:00",
  pattern: "HH:mm:ss",
};

/**
 * 500 rows, opening on the 250th.
 *
 * Not padding: it is the only example where the panel is taller than the screen,
 * so it is the one that exercises the list's own scrolling and the placement
 * that puts the selected row on the trigger — all while the reveal is holding
 * that list at a fixed size and clipping it.
 */
const manyItems = Array.from({ length: 500 }, (_, index) => ({
  value: String(index),
  label: `Item ${String(index + 1).padStart(3, "0")} / 500`,
}));
const manyLabels = Object.fromEntries(manyItems.map((item) => [item.value, item.label]));

/** Inlined so the demo stays a single file with no icon dependency. */
function Glyph({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

const alignments = {
  left: { label: "Left", path: "M2 4h12M2 8h8M2 12h10" },
  center: { label: "Center", path: "M2 4h12M4 8h8M3 12h10" },
  right: { label: "Right", path: "M2 4h12M6 8h8M4 12h10" },
};

/**
 * `items` is what `SelectValue` resolves a value's label from, so it has to be
 * value -> label even when the row renders more than a label. The glyph is the
 * trigger's own business, through the render prop below.
 */
const alignmentLabels = Object.fromEntries(
  Object.entries(alignments).map(([value, { label }]) => [value, label]),
);

/**
 * The popup is clipped out of the trigger's rectangle rather than scaled: it is
 * laid out at its final size for the whole entrance, and only the box around it
 * travels and grows. Watch a row — it never changes size, it is uncovered.
 *
 * `items` takes a record or an array of `{ label, value }` — not a bare array of
 * strings — because `Select.Value` resolves the selected item's label from it
 * rather than echoing the raw value back into the trigger.
 *
 * Keyboard behaviour is Base UI's: typeahead, arrow navigation, Home/End, and
 * Escape all drive the same highlighted state that `data-highlighted` styles.
 *
 * `SelectLabel` must sit **inside** `Select`. It reads the root's context to
 * register itself through `aria-labelledby`, and `Select` renders no element of
 * its own, so the surrounding layout is a plain `div` nested between them.
 */
export function SelectDemo() {
  return (
    <div className="flex max-w-sm flex-col gap-6">
      {/*
        A <label> around the trigger would be wrong even though <button> is a
        labelable element: the label text becomes the button's accessible name,
        which would replace the selected value a screen reader announces.
        SelectLabel keeps the name and the value as separate things.
      */}
      <Select items={fonts} defaultValue="sans">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Font family</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          {Object.entries(fonts).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {/*
                The check trails the label, which is the design's row order and not
                a style preference: the panel opens over the field, so a leading
                indicator — which an unselected row does not have — would both
                indent the selected row out of its own column and push every label
                clear of the value it is standing in for.
              */}
              <SelectItemText>{label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* `size` on the root, so the panel's rows are the height of the field. */}
      <Select items={densities} defaultValue="Medium" size="sm">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Density</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent align="end">
          {Object.entries(densities).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              <SelectItemText>{label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/*
        A filled field beside a ghost one — the inspector row the design is drawn
        for. `ghost` carries no fill until it is hovered and takes only the width
        its value needs, so a row of settings reads as a row of values rather
        than as a wall of boxes. It right-aligns its value by default, which is
        what lines that column up.
      */}
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-foreground-hint">Filled and ghost</span>
        <div className="flex items-center gap-2">
          <Select items={fills} defaultValue="numeric">
            <SelectTrigger wrapperClassName="flex-1">
              <SelectValue />
              <SelectIcon />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(fills).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  <SelectItemText>{label}</SelectItemText>
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select items={formats} defaultValue="short">
            <SelectTrigger variant="ghost">
              <SelectValue />
              <SelectIcon />
            </SelectTrigger>
            <SelectContent align="end">
              {Object.entries(formats).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  <SelectItemText>{label}</SelectItemText>
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        A leading glyph goes before the label in the row and, through
        `SelectValue`'s render prop, in the trigger as well — so the selected row
        and the closed field read as the same thing.
      */}
      <Select items={alignmentLabels} defaultValue="left">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Text alignment</SelectLabel>
          <SelectTrigger>
            <SelectValue>
              {(value: keyof typeof alignments | null) =>
                value && (
                  <span className="flex items-center gap-2">
                    <Glyph path={alignments[value].path} />
                    {alignments[value].label}
                  </span>
                )
              }
            </SelectValue>
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          {Object.entries(alignments).map(([value, { label, path }]) => (
            <SelectItem key={value} value={value}>
              <Glyph path={path} />
              <SelectItemText>{label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/*
        Groups carry their own label and are separated by a rule. The label is a
        `SelectGroupLabel` rather than a disabled item so that arrow navigation
        steps over it and a screen reader announces it as the group's name.
      */}
      <Select items={{ ...fonts, ...formats }} defaultValue="serif">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Grouped</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          <SelectGroup>
            <SelectGroupLabel>Typefaces</SelectGroupLabel>
            {Object.entries(fonts).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <SelectItemText>{label}</SelectItemText>
                <SelectItemIndicator />
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectGroupLabel>Time formats</SelectGroupLabel>
            {Object.entries(formats).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                <SelectItemText>{label}</SelectItemText>
                <SelectItemIndicator />
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      {/*
        The one example where the panel does not fit. It grows to the screen and
        no further — there is no smaller cap, so the selected option always opens
        with its neighbours around it — and the list scrolls inside the clipped
        surface to bring that option onto the field. Which is the case the
        entrance has to survive without the list resizing under it.
      */}
      <Select items={manyLabels} defaultValue="249">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">500 rows</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          {manyItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              <SelectItemText>{item.label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* No `defaultValue`, so the trigger carries `data-placeholder`. */}
      <Select items={fonts}>
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Placeholder</SelectLabel>
          <SelectTrigger>
            <SelectValue placeholder="Choose a typeface" />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          {Object.entries(fonts).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              <SelectItemText>{label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={fonts} defaultValue="sans" disabled>
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Disabled</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <SelectIcon />
          </SelectTrigger>
        </div>
        <SelectContent>
          <SelectItem value="sans">Sans-serif</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
