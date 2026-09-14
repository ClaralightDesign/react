"use client";

import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import { Select as BaseSelect } from "@base-ui/react/select";
import {
  type ComponentProps,
  createContext,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MorphSourceProvider, useMorphAnchor, useMorphSource } from "@/lib/morph";
import { useSurfaceReveal } from "@/lib/reveal";
import { composeRefs, Squircle } from "@/lib/squircle";
import { cn, tokenNumber } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Inlined rather than pulled from an icon library: two glyphs are not worth a
 * dependency in a component consumers copy into their own project, and swapping
 * `lucide-react` in later is a one-line change per icon via `components.json`.
 */

/**
 * The stacked pair of the mockup's dropdown fields — not a single chevron.
 *
 * The pair says "this cycles through values", which is what a select does; one
 * chevron pointing down says "this opens downwards", which is a claim about the
 * popup's placement that is not even reliably true. It is also why nothing here
 * rotates on open: the glyph is vertically symmetric, so a 180° turn is a
 * no-op, and the single chevron's flip was only ever standing in for the second
 * arrowhead this one already has.
 *
 * Drawn on a 9x14 box rather than a square: the two heads need vertical room
 * between them and none at the sides. Geometry is the Flutter painter's,
 * expressed as fractions of that box so the two are one drawing.
 */
function ChevronsIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 9 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M1.35 5.04 4.5 1.12 7.65 5.04" />
      <path d="M1.35 8.96 4.5 12.88 7.65 8.96" />
    </svg>
  );
}

function CheckIcon({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export type SelectSize = "sm" | "md" | "lg";

/**
 * The select's density, published from the root because the trigger and the
 * panel are siblings and have to agree about it.
 *
 * A select is one control: its rows are the height its field is, so a dense
 * field cannot open a comfortable panel. Flutter reaches the same conclusion
 * from the other end — `CLSelect` takes one `size` and `_rowHeight` *is*
 * `_height`. Either part may still be given its own `size` for a layout that
 * genuinely wants them to disagree.
 */
const SelectSizeContext = createContext<SelectSize>("md");

export type SelectProps<
  Value,
  Multiple extends boolean | undefined = false,
> = BaseSelect.Root.Props<Value, Multiple> & {
  /**
   * Shared control-height tokens, applied to the trigger and to the panel's
   * rows. Defaults to `md` rather than the button's `lg`, because a select is
   * usually one control among several in a dense row.
   */
  size?: SelectSize;
};

/**
 * The select root, which also remembers where it was opened from.
 *
 * `SelectContent` is a sibling of the trigger in the tree and a child of a
 * portal in the DOM, so the rectangle it grows out of has to be passed between
 * them. This is the same provider `Dialog` uses — one place where a ClaraLight
 * surface learns its origin, whichever entrance it then draws.
 *
 * The open state is mirrored here, not invented here: `open` still wins when it
 * is controlled and `onOpenChange` still fires for every change, so a consumer's
 * state stays the single source of truth. The mirror exists because the popup
 * has to know a dismissal began in order to reverse the reveal *before* Base UI
 * unmounts it.
 */
export function Select<Value, Multiple extends boolean | undefined = false>({
  open,
  defaultOpen,
  onOpenChange,
  size = "md",
  ...props
}: SelectProps<Value, Multiple>) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen ?? false);
  const handleOpenChange = useCallback(
    (next: boolean, details: BaseSelect.Root.ChangeEventDetails) => {
      setUncontrolled(next);
      onOpenChange?.(next, details);
    },
    [onOpenChange],
  );

  return (
    <SelectSizeContext.Provider value={size}>
      <MorphSourceProvider open={open ?? uncontrolled}>
        <BaseSelect.Root
          open={open}
          defaultOpen={open === undefined ? defaultOpen : undefined}
          onOpenChange={handleOpenChange}
          {...(props as BaseSelect.Root.Props<Value, Multiple>)}
        />
      </MorphSourceProvider>
    </SelectSizeContext.Provider>
  );
}

/** Re-exported unstyled, for building something other than the default content. */
export const SelectPortal: typeof BaseSelect.Portal = BaseSelect.Portal;
export const SelectPositioner: typeof BaseSelect.Positioner = BaseSelect.Positioner;
export const SelectPopup: typeof BaseSelect.Popup = BaseSelect.Popup;
export const SelectList: typeof BaseSelect.List = BaseSelect.List;

export type SelectTriggerProps = Omit<ComponentProps<typeof BaseSelect.Trigger>, "className"> & {
  className?: string;
  /** Applied to the wrapper, which is what a caller's layout sizes. */
  wrapperClassName?: string;
  /** Overrides the density published by `Select`. */
  size?: SelectSize;
  /** Filled by default; `ghost` fills only on hover. */
  variant?: SelectTriggerVariant;
  /**
   * Which end of the field the value sits at. Defaults to `end` for `ghost` and
   * `start` otherwise.
   */
  textAlign?: SelectTriggerAlign;
};

/**
 * Height, horizontal padding and type, per density.
 *
 * The padding does not simply scale with the height: `sm` is 10px and both `md`
 * and `lg` are 12, which is the Flutter select's own table. A taller field wants
 * more room above and below its text, not more beside it — widening the sides
 * with the height would leave a large select looking gappy at the same time as
 * a small one looked cramped.
 *
 * Type steps only once, at `lg`. `sm` and `md` are both `callout`; only the
 * touch-density field goes up to `body`. A caption-sized value would read as
 * secondary text rather than as the field's content.
 */
const triggerSizes = {
  sm: "h-control-sm px-2.5 text-callout",
  md: "h-control-md px-3 text-callout",
  lg: "h-control-lg px-3 text-body",
} as const;

/**
 * Trigger variants.
 *
 * `ghost` carries no fill until it is hovered, for a toolbar row or a quiet
 * field where a filled control per setting would read as a wall of boxes. It
 * also drops the outline: the fill is what marks a standard field as editable,
 * and an outline with nothing inside it is a box drawn for its own sake.
 */
const triggerVariants = {
  standard: "border border-outline bg-control hover:bg-control-highlight",
  ghost: "border border-transparent bg-transparent hover:bg-control-highlight",
} as const;

export type SelectTriggerVariant = keyof typeof triggerVariants;

/**
 * Where the value sits when the field is wider than it needs to be.
 *
 * A `ghost` field defaults to `end`, which is what makes a column of them read
 * as a column of values rather than a ragged list — the label is to its left and
 * the value meets the chevrons. A filled field defaults to `start`, where the
 * fill already draws the column for it.
 */
const triggerAlignments = {
  start: "text-left",
  end: "text-right",
} as const;

export type SelectTriggerAlign = keyof typeof triggerAlignments;

/**
 * The row height, published on the panel for the rows to read.
 *
 * It travels as a custom property rather than as three variants on every row
 * because the row is the one element that cannot know it: `SelectItem` is
 * written by the caller, one per option, and nothing about it says which select
 * it belongs to.
 */
const rowHeights = {
  sm: "[--cl-select-row-height:var(--spacing-control-sm)]",
  md: "[--cl-select-row-height:var(--spacing-control-md)]",
  lg: "[--cl-select-row-height:var(--spacing-control-lg)]",
} as const;

const pressScales = {
  sm: "[--cl-press-scale:var(--cl-press-scale-sm)]",
  md: "[--cl-press-scale:var(--cl-press-scale-md)]",
  lg: "[--cl-press-scale:var(--cl-press-scale-lg)]",
} as const;

export function SelectTrigger({
  className,
  wrapperClassName,
  size: sizeOverride,
  variant = "standard",
  textAlign,
  ref,
  ...props
}: SelectTriggerProps) {
  const align = textAlign ?? (variant === "ghost" ? "end" : "start");
  // Unconditionally, then fall back: `?? useContext(...)` would skip the hook
  // whenever the override is present and reorder every hook after it.
  const inherited = useContext(SelectSizeContext);
  const size = sizeOverride ?? inherited;
  // The rectangle `SelectContent` grows out of. `null` outside a `Select`, which
  // is what lets the trigger be used on its own without the reveal failing.
  const anchor = useMorphAnchor();
  const mergedRef = useMemo(() => composeRefs(anchor ?? undefined, ref), [anchor, ref]);

  return (
    <Squircle
      asChild
      radius="control"
      ring="field"
      wrapperClassName={cn(
        "cl-press",
        // A ghost field has no fill to hold a column, so it takes only the width
        // its value needs and meets the right edge of whatever it is given —
        // the shrink-wrap Flutter does when no explicit width is set.
        variant === "ghost" ? "ms-auto w-fit" : "w-full",
        pressScales[size],
        wrapperClassName,
      )}
    >
      <BaseSelect.Trigger
        ref={mergedRef}
        data-cl-slot="select-trigger"
        className={cn(
          "group flex w-full items-center justify-between gap-1.5",
          "font-sans text-foreground",
          triggerVariants[variant],
          triggerAlignments[align],
          "data-[popup-open]:bg-control-highlight",
          "data-[disabled]:pointer-events-none data-[disabled]:text-foreground-disabled",
          "data-[placeholder]:text-foreground-hint",
          triggerSizes[size],
          className,
        )}
        {...props}
      />
    </Squircle>
  );
}

export type SelectValueProps = Omit<ComponentProps<typeof BaseSelect.Value>, "className"> & {
  className?: string;
};

export function SelectValue({ className, ...props }: SelectValueProps) {
  return (
    <BaseSelect.Value
      data-cl-slot="select-value"
      className={cn("grow truncate", className)}
      {...props}
    />
  );
}

export type SelectIconProps = Omit<ComponentProps<typeof BaseSelect.Icon>, "className"> & {
  className?: string;
};

/**
 * `aria-hidden`, because Base UI already exposes the expanded state on the
 * trigger: the glyph is decoration, not information.
 */
export function SelectIcon({ className, ...props }: SelectIconProps) {
  return (
    <BaseSelect.Icon
      data-cl-slot="select-icon"
      className={cn(
        "shrink-0 text-foreground-tertiary",
        "[&_svg]:w-[var(--cl-select-chevrons-width)] [&_svg]:h-[var(--cl-select-chevrons-height)]",
        className,
      )}
      {...props}
    >
      <ChevronsIcon />
    </BaseSelect.Icon>
  );
}

const NO_COLLISION_AVOIDANCE = { side: "none", align: "none" } as const;

/**
 * Where the selected row sits inside the panel, and how tall the panel is.
 *
 * `offsetTop` rather than `getBoundingClientRect`: it is a layout position, so
 * it is immune to the `translate` the reveal may already be carrying — which is
 * precisely the measurement Base UI's own align mode gets wrong. The Squircle
 * wrapper is the rows' offset parent (it is the only positioned ancestor), so
 * one read already spans the panel's border, its padding and the rows above.
 */
function offsetWithin(element: HTMLElement, ancestor: HTMLElement): number {
  let total = 0;
  let node: HTMLElement | null = element;
  while (node && node !== ancestor) {
    total += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    // `offsetTop` is measured from the offset parent's *padding* box, so each
    // step up has to add that parent's own border back or the sum comes out one
    // border-width short per level. `clientTop` is exactly that border.
    if (parent && parent !== ancestor) total += parent.clientTop;
    else if (parent === ancestor) total += ancestor.clientTop;
    node = parent;
  }
  return total;
}

function selectedRowGeometry(list: HTMLElement, panel: HTMLElement) {
  const row = list.querySelector<HTMLElement>('[data-cl-slot="select-item"][data-selected]');
  const view = list.ownerDocument.defaultView;
  if (!row || !view) return null;
  /**
   * The panel at rest, not the rectangle the reveal is currently drawing.
   *
   * The popup's own `offsetHeight` is the animated one — the reveal writes a
   * height onto it every frame — so a placement that read it mid-entrance would
   * think a 334px panel was 36px tall and hand back an offset that puts the real
   * panel through the bottom of the viewport. The Squircle wrapper is pinned to
   * the resting box for exactly the length of that leg, which makes it the one
   * element that can be asked. Outside a leg it is the popup's own box anyway.
   */
  const box = panel.parentElement;
  const panelHeight = box && box.offsetHeight > 0 ? box.offsetHeight : panel.offsetHeight;
  // Nothing has been laid out yet: Base UI mounts the popup before the
  // positioner has placed it, and a layout effect can land on that frame. Every
  // term below would be zero, and a placement computed from zeroes is not a
  // rough answer but a confident wrong one — `scrollTop` comes out 0, the caller
  // writes it, and the list sits at the top of the 500 rows looking deliberate.
  if (!row.offsetHeight || !panelHeight || !list.clientHeight) return null;
  // `offsetTop` is measured from the offset parent's *padding* box, and
  // `offsetHeight` is its border box, so the panel's own border has to be added
  // back or every row reads one border-width too high. It is the frosted 1px,
  // and it is the difference between landing on the trigger and landing next to
  // it. Adding the offset parent's border is right whichever element that turns
  // out to be: if the rows hang off the wrapper instead, its border is zero and
  // the popup's is already inside `offsetTop`.
  return {
    /** The selected row's centre, measured from the panel's top edge, unscrolled. */
    center: offsetWithin(row, panel) + row.offsetHeight / 2,
    rowHeight: row.offsetHeight,
    /** Where the scrolling window starts inside the panel: the border and padding. */
    listTop: offsetWithin(list, panel),
    listHeight: list.clientHeight,
    panelHeight,
    maxScroll: Math.max(0, list.scrollHeight - list.clientHeight),
  };
}

/**
 * Flutter's `alignSelectedOption` placement, with the one term its panel never
 * needs.
 *
 * The panel wants its selected row centred on the trigger's own centre. Where
 * that would put it off-screen it is clamped instead, and the *residual* of the
 * clamp becomes the list's scroll offset, so the row lands on the trigger
 * anyway. That pairing is the trick, and it is why the two numbers have to be
 * produced together: a 500-row panel cannot be placed 8000px above the viewport,
 * so all of the travel becomes scroll.
 *
 * Flutter clamps against the screen alone, and can, because its panel has no
 * maximum height: `min(panelContentHeight, availableHeight)` means 500 rows fill
 * the screen, so the selected row is always somewhere inside it. This panel caps
 * at `--cl-select-max-height`, and the moment it does, clamping against the
 * screen alone is wrong in a way that looks almost right: the arithmetic still
 * puts the row's *coordinates* on the trigger, but the row is scrolled clean out
 * of the window and what you see is a short panel at the top of the screen with
 * the wrong rows in it. A capped panel therefore has a second constraint — the
 * row has to stay inside the scrolling window — and a third, that the scroll the
 * placement is paired with is one the list can actually reach:
 *
 *   panelTop in [ triggerCentre - listTop - listHeight + rowHeight / 2,
 *                 triggerCentre - listTop - rowHeight / 2 ]
 *          and [ desiredTop, desiredTop + maxScroll ]
 *
 * ## Which placement, out of the many that work
 *
 * Those ranges are *ranges*, not answers. Once the list can scroll, every
 * `panelTop` in them lands the row on the trigger — the scroll absorbs the
 * difference — so the pairing has a degree of freedom that the short-list case
 * does not: a list with nothing to scroll pins `panelTop` to `desiredTop` and
 * there is nothing to choose.
 *
 * Clamping `desiredTop` into the range spends that freedom badly. For 500 rows
 * `desiredTop` is some eight thousand pixels above the viewport, so the clamp
 * always lands on the range's near end — the highest panel that still works —
 * and the selected row comes to rest against the *bottom* edge of the panel,
 * with every remaining option above it and none below. The row is on its trigger
 * and the menu still reads as though it had been scrolled to the end.
 *
 * So the preference is stated instead of falling out of a clamp: centre the row
 * in the scrolling window, which shows as many options after the current one as
 * before it. This is also what Flutter looks like for the same list — its
 * screen-tall panel puts a mid-screen trigger mid-panel — except that Flutter
 * gets it as a byproduct of having no cap, and a capped panel has to ask.
 *
 * The screen still outranks all of it. Intersected with its margins the range
 * can come out empty — a trigger too close to an edge for any placement to
 * satisfy both — and then the panel stays on screen and the row lands where it
 * can.
 */
function alignedPlacement(trigger: HTMLElement, list: HTMLElement, panel: HTMLElement) {
  const geometry = selectedRowGeometry(list, panel);
  const view = trigger.ownerDocument.defaultView;
  if (!geometry || !view) return null;
  const margin =
    tokenNumber(view.getComputedStyle(list).getPropertyValue("--cl-select-screen-margin")) ?? 0;
  const triggerRect = trigger.getBoundingClientRect();
  const viewportHeight = trigger.ownerDocument.documentElement.clientHeight;
  const triggerCenter = triggerRect.top + triggerRect.height / 2;
  const desiredTop = triggerCenter - geometry.center;

  /** Clamps into a range that may itself be inverted, keeping the lower bound. */
  const into = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), Math.max(min, max));

  const onScreenLow = margin;
  const onScreenHigh = Math.max(margin, viewportHeight - margin - geometry.panelHeight);
  // Every placement that lands the row on the trigger: inside the scrolling
  // window, and at a scroll offset between the top of the list and its end. For
  // a list with nothing to scroll the second range is the single point
  // `desiredTop`, which is what keeps a short panel's placement exact.
  const alignedLow = Math.max(
    triggerCenter - geometry.listTop - geometry.listHeight + geometry.rowHeight / 2,
    desiredTop,
  );
  const alignedHigh = Math.min(
    triggerCenter - geometry.listTop - geometry.rowHeight / 2,
    desiredTop + geometry.maxScroll,
  );
  // The one it would like: the row in the middle of the window, with as much of
  // the list visible after it as before it.
  const preferred = triggerCenter - geometry.listTop - geometry.listHeight / 2;

  const low = into(alignedLow, onScreenLow, onScreenHigh);
  const high = into(alignedHigh, onScreenLow, onScreenHigh);
  const panelTop = into(preferred, low, high);

  // The ranges above can fail to overlap — a trigger low enough that a panel tall
  // enough to hold the row cannot also clear the bottom margin. The screen wins
  // that argument, which leaves the paired scroll asking for a row a few pixels
  // below the window's bottom edge. Clamping it back is the one place the
  // alignment is knowingly given up: the row ends up against the near edge
  // instead of on the trigger, off by whatever the conflict was worth. A row
  // that is visible and slightly out of line is a panel that opened where it was
  // asked; a row scrolled out of the window is a panel showing the wrong rows.
  const seenLow = geometry.center + geometry.rowHeight / 2 - geometry.listTop - geometry.listHeight;
  const seenHigh = geometry.center - geometry.rowHeight / 2 - geometry.listTop;
  const scrolled = into(panelTop - desiredTop, seenLow, seenHigh);

  return {
    // The positioner measures its offset from the trigger's far edge.
    sideOffset: panelTop - triggerRect.bottom,
    scrollTop: Math.min(Math.max(scrolled, 0), geometry.maxScroll),
  };
}

/** Frames the placement waits for a panel that has actually been laid out. */
const LAYOUT_WAIT_FRAMES = 30;
/** Frames the scroll offset is re-asserted over before it is left alone. */
const SCROLL_SETTLE_FRAMES = 24;

/** Gestures that end the hold at once, because they are the person scrolling. */
const SCROLL_INTENT = ["wheel", "touchstart", "keydown"] as const;

/**
 * Hold the list at the scroll offset the placement was computed with.
 *
 * Two things have to be waited out, and they pull in opposite directions.
 *
 * The panel is not laid out on the frame this effect first runs: Base UI mounts
 * the popup and the positioner places it afterwards, so a layout effect that
 * measures immediately reads zeroes. `selectedRowGeometry` refuses to answer
 * from those, and this loop keeps asking until it gets a real panel.
 *
 * Then the offset cannot simply be written once. Base UI moves focus to the
 * selected row when the panel opens, and focusing an element inside a scroll
 * container makes the browser scroll it into view — to the *nearest* edge, which
 * is not where the placement put it. On a 500-row list that scroll undid the
 * alignment by 275px, and it lands after this effect.
 *
 * So the target is re-asserted every frame across the entrance and then let go.
 * It deliberately does not stop early once the value has held: the frame the
 * focus scroll arrives on is not fixed, and "it has held for two frames" was
 * true right before it arrived — which is how a 500-row panel ended up showing
 * its first row with the arithmetic still insisting it was aligned. The hold
 * ends instead on the first sign of a person scrolling, so the entrance never
 * fights a wheel or an arrow key.
 */
function useSelectedOptionAlignment({
  list,
  panel,
  trigger,
  enabled,
  open,
}: {
  list: HTMLElement | null;
  panel: HTMLElement | null;
  trigger: RefObject<HTMLElement | null> | null | undefined;
  enabled: boolean;
  open: boolean;
}) {
  useIsomorphicLayoutEffect(() => {
    const anchor = trigger?.current;
    if (!enabled || !open || !list || !panel || !anchor) return;
    const view = list.ownerDocument.defaultView;
    const doc = list.ownerDocument;
    if (!view) return;
    let frame = 0;
    let placement: ReturnType<typeof alignedPlacement> = null;
    let waiting = LAYOUT_WAIT_FRAMES;
    let remaining = SCROLL_SETTLE_FRAMES;
    const release = () => {
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      for (const type of SCROLL_INTENT) doc.removeEventListener(type, release, true);
    };
    const assert = () => {
      frame = 0;
      if (!placement) {
        placement = alignedPlacement(anchor, list, panel);
        if (!placement) {
          waiting -= 1;
          if (waiting > 0) frame = view.requestAnimationFrame(assert);
          else release();
          return;
        }
      }
      if (Math.abs(list.scrollTop - placement.scrollTop) > 0.5)
        list.scrollTop = placement.scrollTop;
      remaining -= 1;
      if (remaining > 0) frame = view.requestAnimationFrame(assert);
      else release();
    };
    // Capture, so the hold ends on the way down rather than after whatever the
    // event was going to scroll has already scrolled.
    for (const type of SCROLL_INTENT) doc.addEventListener(type, release, true);
    assert();
    return release;
  }, [list, panel, trigger, enabled, open]);
}

export type SelectContentProps = Omit<ComponentProps<typeof BaseSelect.Popup>, "className"> & {
  /** Applied to the clipped element: the frost, padding and text. */
  className?: string;
  /** Applied to the wrapper, which is what is positioned and animated. */
  wrapperClassName?: string;
  /** Gap between the trigger and the popup, in px. */
  sideOffset?: number;
  /** Preferred side; Base UI flips when there is not enough room. */
  side?: ComponentProps<typeof BaseSelect.Positioner>["side"];
  align?: ComponentProps<typeof BaseSelect.Positioner>["align"];
  /** Overrides the density published by `Select`, which sets the row height. */
  size?: SelectSize;
  /**
   * Open with the selected option sitting on the trigger, the way a native
   * `<select>` does — and the Flutter select's `alignSelectedOption`, which is
   * likewise on by default.
   *
   * Implemented here rather than delegated to Base UI's `alignItemWithTrigger`,
   * which does the same thing and cannot coexist with the reveal. Base UI's is a
   * measurement loop: it reads the selected row's text box, derives a scroll
   * offset and a panel height from where that text currently sits, and writes
   * `height: 100%` onto the popup. The reveal moves that text — it carries the
   * whole layer on a `translate` — and animates that exact height. Base UI
   * guards the popup's own transform before measuring but cannot guard a wrapper
   * between the popup and the positioner, which is where the shape's SVG
   * overlays force ours to live. Measured, the two disagreed by 131px on a
   * 500-row panel, which opened near the top of the viewport instead of on its
   * trigger.
   *
   * The placement below is Flutter's own, which is a closed-form calculation
   * rather than a loop and so has nothing to disagree with. `false` opens the
   * panel below the trigger like any other popup.
   */
  alignSelectedOption?: boolean;
};

/**
 * Portal, positioner and popup in the composition everyone actually wants.
 *
 * ## The entrance is a reveal, not a scale
 *
 * The panel is laid out at its final size and **clipped** out of the trigger's
 * rectangle: the box travels and grows, the rows inside it never move relative
 * to each other. `lib/reveal.tsx` has the argument for why a menu cannot use the
 * dialog's projective morph — briefly, a list of labels the eye is already
 * reading must not be squashed and sprung back.
 *
 * That costs one element more than a scale would. Three boxes, three jobs:
 *
 *   the Squircle wrapper   pinned to its resting size for the leg, so Base UI's
 *                          positioner never sees the box resize under it and
 *                          spend the entrance re-solving its own placement
 *   the popup              the clipped element, and the animated rectangle;
 *                          Lisse regenerates the corner path, the 1px outline
 *                          and the shadow at every size it passes through
 *   the content            held at its resting size and centred, which is the
 *                          part that makes this a clip rather than a stretch
 *
 * `--anchor-width` is Base UI's measurement of the field, so the panel can match
 * it. Its `--available-height` is only consulted when the panel opens *against*
 * the trigger — an aligned panel is placed by its contents and gets the screen;
 * see `.cl-select-list` in `base.css`. `--transform-origin` is no longer read:
 * the reveal knows the trigger's real rectangle, which is strictly more than an
 * origin.
 */
export function SelectContent({
  className,
  wrapperClassName,
  children,
  sideOffset,
  side,
  align = "start",
  size: sizeOverride,
  alignSelectedOption = true,
  ...props
}: SelectContentProps) {
  const inherited = useContext(SelectSizeContext);
  const size = sizeOverride ?? inherited;
  const positionerRef = useRef<HTMLDivElement>(null);
  const source = useMorphSource();
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [shape, setShape] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  useSurfaceReveal({
    wrapper,
    shape,
    content,
    anchor: source?.anchor,
    open: source?.open ?? true,
  });
  useSelectedOptionAlignment({
    list: content,
    panel: shape,
    trigger: source?.anchor,
    enabled: alignSelectedOption,
    open: source?.open ?? true,
  });
  /**
   * Hang the panel's chrome over the field, so the menu covers the control it
   * replaces instead of sitting a few pixels inside it.
   *
   * `align: "start"` lines the panel's *border* up with the field's, which puts
   * the panel's padding — and with it the whole column of rows — inside the
   * field's own edges. The field then shows on one side and the panel overhangs
   * on the other, which is the thing you cannot stop seeing once you have seen
   * it. Flutter states the rule the other way round and gets it symmetric: the
   * panel's **content box** is what spans the field, so the padding and the
   * hairline hang over by the same amount at both ends. The list carries the
   * matching `min-width` below, and the two have to be read together — either
   * one alone is a panel that does not line up.
   *
   * Base UI pays part of this back on its own, but only inside
   * `alignItemWithTrigger`, which this component declines. So the panel asks for
   * it here, by the same rule Flutter uses:
   * `-(_panelHorizontalPadding + _panelOutlineWidth)`, mirrored when the panel
   * is aligned to the field's far edge.
   *
   * Read rather than assumed: the padding is a token a theme can move, the
   * border is whatever `.cl-frost` draws, and the logical properties keep the
   * sum correct in RTL.
   */
  const themedAlignOffset = () => {
    const positioner = positionerRef.current;
    const view = positioner?.ownerDocument.defaultView;
    if (!positioner || !view) return 0;
    const panel = positioner.querySelector<HTMLElement>('[data-cl-slot="select-content"]');
    const panelStyle = view.getComputedStyle(panel ?? positioner);
    const px = (value: string) => Number.parseFloat(value) || 0;
    // One sign for both ends: Floating UI already mirrors an alignment offset
    // for `end`, so asking to move *inwards* by the chrome moves the panel
    // start-ward at `start` and end-ward at `end` — the overhang is the same on
    // whichever edge the panel was aligned to.
    return -(px(panelStyle.paddingInlineStart) + px(panelStyle.borderInlineStartWidth));
  };
  /** The aligned placement's side offset; falls back when there is no selection. */
  const alignedSideOffset = () => {
    const anchor = source?.anchor?.current;
    const panel = positionerRef.current?.querySelector<HTMLElement>(
      '[data-cl-slot="select-content"]',
    );
    const list = panel?.querySelector<HTMLElement>('[data-cl-slot="select-content-body"]');
    if (!anchor || !panel || !list) return themedSideOffset();
    return alignedPlacement(anchor, list, panel)?.sideOffset ?? themedSideOffset();
  };
  const themedSideOffset = () => {
    const element = positionerRef.current;
    if (!element) return 0;
    const value = element.ownerDocument.defaultView
      ?.getComputedStyle(element)
      .getPropertyValue("--cl-select-side-offset");
    return Number.parseFloat(value ?? "") || 0;
  };

  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        ref={positionerRef}
        // Viewport coordinates, which is the frame the placement below works in
        // and the only one that keeps an 800px-tall menu out of the page's own
        // scroll height. Base UI positions absolutely by default: the popup then
        // counts towards the document's scrollable area, and the browser scrolls
        // the *page* to reveal the row it has just focused — the whole layout
        // jumps by the trigger's own offset and slides back as the entrance
        // shrinks the overflow away. A menu must not move the page behind it.
        positionMethod="fixed"
        sideOffset={sideOffset ?? (alignSelectedOption ? alignedSideOffset : themedSideOffset)}
        alignOffset={themedAlignOffset}
        side={side}
        align={align}
        alignItemWithTrigger={false}
        // The aligned placement is already clamped into the viewport by the same
        // calculation that produced it, and any further shifting would break the
        // scroll offset that is paired with it.
        collisionAvoidance={alignSelectedOption ? NO_COLLISION_AVOIDANCE : undefined}
        className="z-50 outline-none select-none"
      >
        {/*
          The width constraints sit on the wrapper: it is what the SVG overlays
          anchor to, so it has to be exactly the shape's box, and it is the box
          the reveal pins. `.cl-morph` drops the 5% nudge `.cl-enter-root` would
          otherwise add — the reveal owns the geometry, and a second, coarser
          claim on it would land the resting box 5% off the trigger.
        */}
        <Squircle
          asChild
          radius="medium"
          wrapperRef={setWrapper}
          wrapperClassName={cn(
            "cl-enter-root cl-morph w-fit",
            "max-w-[min(var(--cl-select-max-width),var(--available-width))]",
            wrapperClassName,
          )}
        >
          <BaseSelect.Popup
            ref={setShape}
            data-cl-slot="select-content"
            className={cn(
              "cl-exit-sentinel cl-reveal cl-frost font-sans text-foreground",
              "p-[var(--cl-select-panel-padding)]",
              rowHeights[size],
              className,
            )}
            {...props}
          >
            {/*
              The list is three things at once, and they have to be one element.

              It is the scroller — Base UI's select reads `listElement ||
              popupElement` and scrolls it, and the aligned placement measures
              it. It is the box the reveal holds still, so the rows keep their
              resting layout while the clipped element around them travels. And
              it is the scroll area's viewport, which is what puts the edges and
              the overlay scrollbar on it.

              Hence `render`: `ScrollArea.Viewport` composes *onto* `Select.List`
              rather than wrapping it. A wrapper would be worse than untidy —
              Base UI moves focus to the selected item by walking down from the
              popup, and an element in between leaves focus on the popup with
              nothing highlighted.

              `mask`, not `blur`. The blur edge needs an opaque fill to work
              against; over `cl-frost` there is barely any colour to blur and the
              engine lifts it into a white halo. `scroll-area.tsx` says so at
              length, and a frosted panel is exactly the case it warns about.
            */}
            {/*
              The band each side dissolves over is shorter than the scroll area's
              own default, because this viewport's content is rows: at 24px a
              short row sitting at the edge fades across most of its own height
              and reads as disabled rather than as clipped. Flutter's select
              makes the same reduction against the identical default on `CLList`.
            */}
            <BaseScrollArea.Root
              data-cl-slot="select-scroll-area"
              className={cn(
                "cl-scroll-area",
                "[--cl-scroll-edge-block-start:var(--cl-select-scroll-edge)]",
                "[--cl-scroll-edge-block-end:var(--cl-select-scroll-edge)]",
              )}
            >
              <BaseSelect.List
                ref={setContent}
                data-cl-slot="select-content-body"
                // Only a panel opening *against* its trigger is limited by the
                // room there; one placed by its selected option gets the screen.
                data-cl-fit={alignSelectedOption ? undefined : "anchor"}
                // The rows are at least as wide as the field they replace —
                // stated on the column itself rather than as a width for the
                // panel, so the panel's own padding and hairline are added to it
                // rather than taken out of it. That is what lets the panel cover
                // the field with `themedAlignOffset`'s overhang above.
                className="min-w-[var(--anchor-width)] cl-select-list cl-scroll-viewport overscroll-contain"
                render={<BaseScrollArea.Viewport />}
              >
                {children}
              </BaseSelect.List>
              <BaseScrollArea.Scrollbar
                orientation="vertical"
                data-cl-slot="scroll-area-scrollbar"
                data-cl-visibility="auto"
                className="cl-scrollbar"
              >
                <BaseScrollArea.Thumb
                  data-cl-slot="scroll-area-thumb"
                  className="cl-scroll-thumb"
                />
              </BaseScrollArea.Scrollbar>
            </BaseScrollArea.Root>
          </BaseSelect.Popup>
        </Squircle>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export type SelectItemProps = Omit<ComponentProps<typeof BaseSelect.Item>, "className"> & {
  className?: string;
};

const itemBase = [
  // The row is the height of the field that opened it, published as
  // `--cl-select-row-height` by `SelectContent`. Fixed rather than derived from
  // the label, so a row with a glyph in it is not taller than one without.
  "relative flex h-[var(--cl-select-row-height)] shrink-0 items-center",
  "cursor-default gap-2 rounded-item px-[var(--cl-select-row-padding)]",
  "text-callout font-normal text-foreground outline-none select-none",
  "data-[highlighted]:bg-control",
  // The selected row is the one place a menu spends colour: accent on its own
  // wash, a step heavier, with the check in the same accent. Unselected rows
  // stay at full foreground — dimming them would make every row look disabled
  // next to the one that is not.
  "data-[selected]:bg-accent-background data-[selected]:font-medium data-[selected]:text-accent",
  "data-[disabled]:pointer-events-none data-[disabled]:text-foreground-disabled",
  "[&_svg]:size-4",
  "transition-colors duration-(--cl-duration-fast) ease-cl-out",
].join(" ");

/**
 * The item radius has its own token so nested corners remain comfortable
 * inside the medium-radius popup.
 *
 * `cl-select-row` carries the one state Tailwind cannot: a selected row under
 * the pointer, where the hover fill has to composite *over* the accent wash
 * rather than replace it. See `base.css`.
 */
export function SelectItem({ className, ...props }: SelectItemProps) {
  return (
    <BaseSelect.Item
      data-cl-slot="select-item"
      className={cn("cl-select-row", itemBase, className)}
      {...props}
    />
  );
}

export type SelectItemIndicatorProps = Omit<
  ComponentProps<typeof BaseSelect.ItemIndicator>,
  "className"
> & { className?: string };

/**
 * The selected mark, on the **trailing** edge of its item.
 *
 * The row is `[leading] [label] [gap] [check]`, which is the design's own — the
 * check belongs after the value, where the eye already is, and it is what keeps
 * the row honest in two ways that are easy to lose by reordering the JSX:
 *
 * - every row's label starts in the same column, because an unselected row has no
 *   indicator at all and a leading one would indent only the selected row;
 * - the panel opens over the field it replaces, so the row the person is looking
 *   at is the one already under their eye. A leading indicator would push every
 *   label 24px right of the value it is standing in for, which is the one place
 *   in the menu where a shifted column is impossible not to read as an error.
 *
 * `ml-auto` states the position in the indicator rather than relying on a sibling
 * growing, so a row without a label still keeps its mark on the trailing edge.
 */
export function SelectItemIndicator({ className, ...props }: SelectItemIndicatorProps) {
  return (
    <BaseSelect.ItemIndicator
      data-cl-slot="select-item-indicator"
      className={cn("ml-auto flex w-4 shrink-0 items-center justify-center text-accent", className)}
      {...props}
    >
      <CheckIcon />
    </BaseSelect.ItemIndicator>
  );
}

export type SelectItemTextProps = Omit<ComponentProps<typeof BaseSelect.ItemText>, "className"> & {
  className?: string;
};

/**
 * The label, which takes the row's free space so the trailing indicator is pushed
 * against the far edge — the `Expanded` of the Flutter row, and what lets a long
 * label truncate instead of moving the check out of the popup.
 */
export function SelectItemText({ className, ...props }: SelectItemTextProps) {
  return (
    <BaseSelect.ItemText
      data-cl-slot="select-item-text"
      className={cn("grow truncate", className)}
      {...props}
    />
  );
}

export type SelectGroupProps = Omit<ComponentProps<typeof BaseSelect.Group>, "className"> & {
  className?: string;
};

export function SelectGroup({ className, ...props }: SelectGroupProps) {
  return <BaseSelect.Group className={className} {...props} />;
}

export type SelectGroupLabelProps = Omit<
  ComponentProps<typeof BaseSelect.GroupLabel>,
  "className"
> & { className?: string };

export function SelectGroupLabel({ className, ...props }: SelectGroupLabelProps) {
  return (
    <BaseSelect.GroupLabel
      className={cn("px-2 py-1.5 text-label text-foreground-hint", className)}
      {...props}
    />
  );
}

export type SelectSeparatorProps = Omit<
  ComponentProps<typeof BaseSelect.Separator>,
  "className"
> & { className?: string };

export function SelectSeparator({ className, ...props }: SelectSeparatorProps) {
  return <BaseSelect.Separator className={cn("my-1 h-px bg-separator", className)} {...props} />;
}

export type SelectLabelProps = Omit<ComponentProps<typeof BaseSelect.Label>, "className"> & {
  className?: string;
};

export function SelectLabel({ className, ...props }: SelectLabelProps) {
  return (
    <BaseSelect.Label className={cn("text-label text-foreground-tertiary", className)} {...props} />
  );
}
