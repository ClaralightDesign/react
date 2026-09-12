import {
  Select,
  SelectContent,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@claralight/react";

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

/**
 * The popup grows from the trigger because Base UI sets `--transform-origin` on
 * the positioner from the trigger's actual position, and `SelectContent` scales
 * from it.
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
    <div className="flex max-w-sm flex-col gap-5">
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
                a style preference: Base UI aligns the popup by putting the selected
                item's text over the trigger's value, so a leading indicator — which
                an unselected row does not have — would both indent the selected row
                out of its own column and push the whole popup off its anchor.
              */}
              <SelectItemText>{label}</SelectItemText>
              <SelectItemIndicator />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select items={densities} defaultValue="Medium">
        <div className="flex flex-col gap-1.5">
          <SelectLabel className="text-label text-foreground-tertiary">Density</SelectLabel>
          <SelectTrigger size="sm">
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
