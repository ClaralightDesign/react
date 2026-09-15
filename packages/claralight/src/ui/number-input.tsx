"use client";

import type { NumberFieldRoot } from "@base-ui/react/number-field";
import { NumberField } from "@base-ui/react/number-field";
import { Tooltip } from "@base-ui/react/tooltip";
import Scritto from "@scritto/react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AnchoredSurface, themedNumber, useThemedNumber } from "@/lib/anchored";
import {
  advanceScrub,
  nextScrubTier,
  roundScrubbedValue,
  SCRUB_BASE_SPACING,
  SCRUB_SPACING_TRANSITION,
  type ScrubTier,
  scrubSpacing,
  stepsToBoundary,
} from "@/lib/scrub";
import { Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * ClaraLight's numeric field — the inspector inputs of the design ("X 12px",
 * "W 78").
 *
 * It is a separate component from `Input` rather than a mode of it, because the
 * two are different elements: a numeric field is a `NumberField.Group` holding
 * an input, a stepper and two scrub handles, and Base UI owns the parsing,
 * formatting and `spinbutton` semantics that make it one control. Both draw
 * their surface from `inputVariants`' geometry, so a numeric field and a text
 * field in the same form are the same height and share an edge.
 *
 * ## The three ways to change the value
 *
 * **Type it.** Base UI parses and formats through `Intl.NumberFormat`.
 *
 * **Step it.** The chevrons, the arrow keys and the wheel each move by `step`.
 *
 * **Scrub it.** Drag the prefix or the stepper strip sideways and the value
 * follows the pointer. This is the affordance the design is built around, and
 * the rest of this file is mostly in service of it.
 *
 * The two overlap on purpose: the chevrons are inside the scrub handle, so the
 * same press can end as either a step or a drag, decided by how far the pointer
 * travels rather than by where it landed. A field with no prefix would
 * otherwise have nothing to scrub from but the few pixels of strip around two
 * 18x10 buttons. `useAdjustment` owns that arbitration, and it is why the
 * chevrons are plain buttons rather than `NumberField.Increment`.
 *
 * ## What scrubbing has to get right
 *
 * A ruler appears under the pointer while scrubbing, which turns the gesture
 * into a promise: one tick crossing the centre line is one step. Vertical
 * movement changes the ruler's pitch — drag down for precision, up for reach —
 * so the same gesture covers `0.25` and `4` steps per notch without a modifier
 * key. `lib/scrub.ts` holds that arithmetic and the reasoning behind it.
 *
 * Base UI's `ScrubArea` keeps the platform half of the gesture: pointer lock,
 * a virtual cursor that wraps at the viewport edge so a drag is never cut short
 * by the screen, and touch-scroll suppression. Its own increment rule is
 * neutralised — see `SCRUB_SENSITIVITY_OFF` — and so is its commit, which fires
 * on every release whether or not the value moved.
 *
 * ## Modifier keys deliberately do nothing
 *
 * Base UI steps by `largeStep` on shift and `smallStep` on alt. ClaraLight
 * does not: precision is the scrub gesture's vertical axis, and a field that
 * also had two hidden keyboard step sizes would have three different answers to
 * "how much is one step". A modified arrow key is left to the text caret.
 */

/** Matches `Squircle`'s guard: a layout effect has nothing to measure on a server. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Identifies which end of the range a stepper's leading chevron points at. */
export type NumberInputDirection = "up" | "down" | "left" | "right";

/**
 * Large enough that `ScrubArea`'s own accumulator can never reach it, which
 * turns its increment rule off while leaving pointer lock, the wrapping virtual
 * cursor and the pointer-up commit in place. A scrub that travelled this far
 * would have crossed the observable universe in pixels.
 */
const SCRUB_SENSITIVITY_OFF = Number.MAX_SAFE_INTEGER;

/** Movement before a press on a scrub handle is read as a drag, in pixels. */
const SCRUB_ACTIVATION_DISTANCE = 4;

/** How long a chevron is held before it starts repeating, and how fast it then does. */
const STEP_REPEAT_DELAY = 500;
const STEP_REPEAT_INTERVAL = 80;

/** Idle time after the last wheel notch before the interaction is committed. */
const WHEEL_COMMIT_DELAY = 120;

/**
 * The control surface. The geometry is `inputVariants`' so the two field types
 * line up, but the padding is the group's rather than the input's: the stepper
 * strip sits flush against the trailing edge, as it does in the design, so the
 * trailing inset belongs to the content and not to the box.
 */
export const numberInputVariants = cva(
  [
    "relative flex w-full items-center border border-outline",
    "bg-control font-mono text-foreground",
    "transition-[background-color,border-color,color] duration-(--cl-duration-fast) ease-cl-out",
    "hover:bg-control-highlight",
    "data-[disabled]:pointer-events-none data-[disabled]:text-foreground-disabled",
    "data-[invalid]:border-danger",
  ],
  {
    variants: {
      size: {
        sm: "h-control-sm text-mono",
        md: "h-control-md text-mono-strong",
        lg: "h-control-lg text-mono-strong",
      },
    },
    defaultVariants: { size: "md" },
  },
);

/** Leading inset, matching `Input`'s so the two fields share a text edge. */
const LEADING_PAD = { sm: "pl-2", md: "pl-3", lg: "pl-4" } as const;

export interface NumberInputProps
  extends Omit<
    ComponentProps<typeof NumberField.Root>,
    "className" | "onValueChange" | "onValueCommitted" | "prefix" | "render" | "step" | "suffix"
  > {
  /**
   * Shared control density. Not `VariantProps`, which would also admit `null`:
   * the size picks the leading inset from a lookup, so it has to be a key.
   */
  size?: NonNullable<VariantProps<typeof numberInputVariants>["size"]>;
  /** Amount one step moves. `0` removes the stepper and the scrub handles. */
  step?: number;
  /** Which way the leading chevron points, and therefore which keys step. */
  direction?: NumberInputDirection;
  /** Leading label, dimmed — the axis letter in the design's inspector rows. */
  prefix?: ReactNode;
  /** Trailing unit, dimmed. Hidden while scrubbing, where the readout has it. */
  suffix?: ReactNode;
  placeholder?: string;
  /** Renders the field with error colours, alongside any `Field` validation. */
  invalid?: boolean;
  /** Fires on every change, including each step of a scrub. */
  onValueChange?: (value: number | null, reason: NumberFieldRoot.ChangeEventReason) => void;
  /** Fires once when an interaction ends: pointer release, blur, or a keypress. */
  onValueCommitted?: (value: number | null, reason: NumberFieldRoot.CommitEventReason) => void;
  /** Fires when Escape abandons an interaction, with the value it restored. */
  onCancel?: (value: number | null) => void;
  /** Applied to the clipped surface: fill, border, text. */
  className?: string;
  /** Applied to the wrapper, which is what a caller's layout sizes. */
  wrapperClassName?: string;
}

export function NumberInput({
  id: idProp,
  size = "md",
  step = 1,
  direction = "up",
  prefix,
  suffix,
  placeholder,
  invalid,
  value: valueProp,
  defaultValue,
  min,
  max,
  disabled = false,
  readOnly = false,
  onValueChange,
  onValueCommitted,
  onCancel,
  className,
  wrapperClassName,
  ...props
}: NumberInputProps) {
  // The chevrons point `aria-controls` at the input, so it needs a name even
  // when the caller did not give the field one.
  const generatedId = useId();
  const id = idProp ?? generatedId;

  const [uncontrolled, setUncontrolled] = useState<number | null>(defaultValue ?? null);
  const value = valueProp === undefined ? uncontrolled : valueProp;

  /*
   * The scrub writes the value between renders — it asks whether the next step
   * is still in range immediately after applying the previous one — so the
   * authoritative value during a gesture is this ref, not the render's closure.
   */
  const valueRef = useRef(value);
  valueRef.current = value;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  /*
   * Drawn and adjustable are separate questions. A disabled or read-only field
   * keeps the stepper, greyed and inert, so that disabling a row of inspector
   * fields never reflows it — the same reasoning as the Flutter field's.
   */
  const hasStepper = step > 0;
  const adjustable = hasStepper && !disabled && !readOnly;

  const setValue = useEvent((next: number | null, reason: NumberFieldRoot.ChangeEventReason) => {
    valueRef.current = next;
    if (valueProp === undefined) setUncontrolled(next);
    onValueChange?.(next, reason);
  });

  const canStep = useEvent((towards: 1 | -1) => {
    if (!adjustable) return false;
    const current = valueRef.current;
    if (current === null) return false;
    if (towards > 0 && max !== undefined && current >= max) return false;
    if (towards < 0 && min !== undefined && current <= min) return false;
    return true;
  });

  const bumpBy = useEvent((steps: number, reason: NumberFieldRoot.ChangeEventReason) => {
    const current = valueRef.current;
    if (current === null) return;
    let next = current + steps * step;
    if (min !== undefined && next < min) next = min;
    if (max !== undefined && next > max) next = max;
    next = roundScrubbedValue(next);
    if (next === current) return;
    setValue(next, reason);
  });

  const commit = useEvent((next: number | null, reason: NumberFieldRoot.CommitEventReason) => {
    onValueCommitted?.(next, reason);
  });

  const cancelled = useEvent((restored: number | null) => {
    onCancel?.(restored);
  });

  const { scrub, engaged, beginScrub, beginPress, dropRuler, readout } = useAdjustment({
    adjustable,
    canStep,
    bumpBy,
    commit,
    valueRef,
    setValue,
    onCancel: cancelled,
    inputRef,
  });

  useWheelStepping({ inputRef, adjustable, canStep, bumpBy, commit, valueRef });
  useEscapeRevert({
    inputRef,
    value,
    valueRef,
    setValue,
    onCancel: cancelled,
    scrubbing: scrub !== null,
  });

  /*
   * What the input is showing. Base UI owns the formatted text and keeps it
   * through partial typing ("1.", "-"), so it is read back off the element
   * rather than derived from the number — deriving it would collapse a value
   * mid-edit and take the caret with it.
   */
  const [display, setDisplay] = useState("");
  const syncDisplay = useEvent(() => {
    const text = inputRef.current?.value ?? "";
    setDisplay((previous) => (previous === text ? previous : text || (placeholder ?? "")));
  });
  useIsomorphicLayoutEffect(syncDisplay);

  const focusFromBody = useEvent((event: ReactMouseEvent) => {
    const input = inputRef.current;
    if (!input || disabled || readOnly || event.target === input) return;
    event.preventDefault();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  const axis = direction === "up" || direction === "down" ? "vertical" : "horizontal";
  const leading = direction === "up" || direction === "left" ? 1 : -1;

  /*
   * Base UI reads Up/Down only, and steps by `largeStep`/`smallStep` under a
   * modifier. Both are corrected here, before Base UI's own handler, which
   * bails out of anything already default-prevented.
   */
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!adjustable || event.defaultPrevented) return;
    const modified = event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";

    if (modified && (vertical || horizontal)) {
      if (axis === "vertical" ? vertical : horizontal) event.preventDefault();
      return;
    }
    if (axis === "vertical" || !horizontal) return;

    // A horizontal stepper owns the horizontal arrows, so they step the value
    // rather than moving the caret — the same trade the Flutter field makes.
    event.preventDefault();
    const towards = (event.key === "ArrowLeft" ? leading : -leading) as 1 | -1;
    if (!canStep(towards)) return;
    bumpBy(towards, "keyboard");
    commit(valueRef.current, "keyboard");
  };

  const ticks =
    scrub && value !== null
      ? {
          increase: stepsToBoundary(max, value, step, true),
          decrease: stepsToBoundary(min, value, step, false),
        }
      : null;

  return (
    <NumberField.Root
      id={id}
      value={value}
      min={min}
      max={max}
      step={step > 0 ? step : "any"}
      // Precision is the scrub's vertical axis; a modified key must not be a
      // second, invisible step size. See the note at the top of this file.
      smallStep={step > 0 ? step : undefined}
      largeStep={step > 0 ? step : undefined}
      disabled={disabled}
      readOnly={readOnly}
      onValueChange={(next, details) => setValue(next, details.reason)}
      /*
       * Base UI's scrub area commits on every release, changed or not, and
       * always as `scrub`. `useAdjustment` knows whether the value actually
       * moved and whether the interaction was a drag or a chevron, so its
       * commit replaces that one rather than joining it.
       */
      onValueCommitted={(next, details) =>
        details.reason === "scrub" ? undefined : commit(next, details.reason)
      }
      className={cn("block w-full", wrapperClassName)}
      {...props}
    >
      <Squircle asChild radius="control" ring="field" wrapperClassName="block w-full">
        <NumberField.Group
          data-cl-slot="number-input"
          data-invalid={invalid || undefined}
          className={cn(numberInputVariants({ size }), hasStepper ? undefined : "pr-3", className)}
        >
          {prefix === undefined ? (
            <span aria-hidden="true" className={cn("shrink-0", LEADING_PAD[size])} />
          ) : (
            <ScrubHandle
              enabled={adjustable}
              engaged={engaged}
              onScrubStart={beginScrub}
              className={cn(
                "flex shrink-0 items-center self-stretch pr-2.5",
                LEADING_PAD[size],
                slotClass(size, false, disabled),
              )}
            >
              {prefix}
            </ScrubHandle>
          )}

          {/*
           * Clicking the empty space after the value edits the field, which it
           * would not on its own: the input is only as wide as its text, so
           * most of this box is not the input.
           */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: focus forwarding, not a control */}
          <div
            ref={bodyRef}
            onMouseDown={focusFromBody}
            className="relative flex min-w-0 flex-1 items-center self-stretch"
          >
            <div
              /*
               * The value and the ruler occupy the same box and cross-fade, so
               * the ruler reads as the field *becoming* a scale rather than as
               * a panel drawn over it.
               */
              className={cn(
                // No gap: the unit is part of the value, "12px" not "12 px".
                "flex min-w-0 flex-1 items-baseline transition-opacity ease-cl-out",
                scrub ? "opacity-0 duration-(--cl-duration-fast)" : "opacity-100",
                scrub ? undefined : "duration-(--cl-duration-exit)",
                "motion-reduce:duration-(--cl-duration-reduced)",
              )}
            >
              {/*
               * The value is only as wide as it reads, so the unit sits against
               * it — "12px", not "12" at one end of the field and "px" at the
               * other. An input has no intrinsic width, so a mirror of the same
               * text in the same font supplies one and the input is laid over
               * it. `field-sizing: content` would do this natively, but not in
               * every engine, and a field that is one width in Chromium and
               * another in Safari is worse than the machinery.
               */}
              <span className="relative block min-w-0 max-w-full shrink">
                <span aria-hidden="true" className="invisible block whitespace-pre pr-px">
                  {display}
                </span>
                <NumberField.Input
                  /*
                   * Not `NumberField.Root`'s `inputRef`, which is the hidden
                   * form input: the wheel, Escape and the readout all need the
                   * visible one, whose value is the formatted text on screen.
                   */
                  ref={inputRef}
                  placeholder={placeholder}
                  onKeyDown={handleKeyDown}
                  onInput={syncDisplay}
                  className={cn(
                    "absolute inset-0 w-full min-w-0 bg-transparent tabular-nums outline-none",
                    "placeholder:text-foreground-hint",
                    "data-[disabled]:text-foreground-disabled",
                    "data-[disabled]:placeholder:text-foreground-disabled",
                  )}
                />
              </span>
              {suffix === undefined ? null : (
                <span className={cn("shrink-0", slotClass(size, true, disabled))}>{suffix}</span>
              )}
            </div>
            {scrub === null ? null : (
              <ScrubRuler
                progress={scrub.progress}
                spacing={scrub.spacing}
                increase={ticks?.increase ?? null}
                decrease={ticks?.decrease ?? null}
                revealed={scrub.phase === "in"}
                onFadedOut={dropRuler}
              />
            )}
          </div>

          {hasStepper ? (
            <Stepper
              axis={axis}
              leading={leading}
              enabled={adjustable}
              engaged={engaged}
              controls={id}
              canStep={canStep}
              onScrubStart={beginScrub}
              onPress={beginPress}
            />
          ) : null}
        </NumberField.Group>
      </Squircle>

      <ScrubReadout
        anchor={bodyRef}
        open={scrub !== null && readout !== null}
        value={readout ?? ""}
        suffix={suffix}
      />
    </NumberField.Root>
  );
}

/** Prefix and suffix typography: dimmed, and mono only for the unit. */
function slotClass(size: "sm" | "md" | "lg", mono: boolean, disabled: boolean) {
  return cn(
    mono ? "font-mono" : "font-sans font-normal",
    mono
      ? size === "sm"
        ? "text-mono"
        : "text-mono"
      : size === "sm"
        ? "text-caption"
        : "text-callout",
    disabled ? "text-foreground-disabled" : "text-foreground-tertiary",
    "[&_svg]:shrink-0",
    size === "sm" ? "[&_svg]:size-icon-sm" : "[&_svg]:size-icon-md",
  );
}

/* -------------------------------------------------------------------------
 * The gesture
 * ---------------------------------------------------------------------- */

/**
 * A callback with a fixed identity that always runs the latest body.
 *
 * Both gestures below install listeners for the duration of an interaction, and
 * both change the value while that interaction is running. Depending on the raw
 * callbacks would tear those listeners down and rebuild them on every step —
 * which cost the wheel its commit outright, since the pending timer was
 * cancelled by the cleanup of the very render its own step had caused.
 */
function useEvent<T extends (...args: never[]) => unknown>(callback: T): T {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback(((...args: never[]) => latest.current(...args)) as T, []);
}

/** What the ruler needs to draw itself, published once per animation frame. */
interface ScrubFrame {
  progress: number;
  spacing: number;
  phase: "in" | "out";
}

interface AdjustmentSession {
  dy: number;
  tier: ScrubTier;
  progress: number;
  /** The pitch the ruler is easing away from, and the one it is easing to. */
  from: number;
  to: number;
  since: number;
  /** Total pointer travel, which is what decides press against drag. */
  moved: number;
  /** Whether the travel has passed the threshold and the drag has won. */
  engaged: boolean;
  /** The value the interaction started at, restored when Escape abandons it. */
  origin: number | null;
}

/** A chevron being held down, until the drag takes the interaction away. */
interface PressSession {
  towards: 1 | -1;
  /** Whether the hold has started repeating, which suppresses the release step. */
  repeated: boolean;
}

interface AdjustmentOptions {
  adjustable: boolean;
  canStep: (towards: 1 | -1) => boolean;
  bumpBy: (steps: number, reason: NumberFieldRoot.ChangeEventReason) => void;
  commit: (value: number | null, reason: NumberFieldRoot.CommitEventReason) => void;
  valueRef: { current: number | null };
  setValue: (value: number | null, reason: NumberFieldRoot.ChangeEventReason) => void;
  onCancel: ((value: number | null) => void) | undefined;
  inputRef: { current: HTMLInputElement | null };
}

/**
 * One interaction, two possible outcomes: a step, or a scrub.
 *
 * Press and drag are not separate regions of the control. Anywhere in the
 * stepper strip — the chevrons included — a press might become either, and
 * which one it is depends on what the pointer does next, not on where it
 * landed. That is the whole reason this is one hook: a field without a prefix
 * would otherwise have only the few pixels of strip around the chevrons to
 * scrub from, which is no affordance at all.
 *
 * The arbitration is Flutter's, and it is a distance: under
 * `SCRUB_ACTIVATION_DISTANCE` the interaction is still a press, and past it the
 * drag has won and the press is abandoned. It follows that a chevron steps on
 * *release* rather than on press — stepping on the way down would leave a stray
 * step in front of every drag that started on a button.
 *
 * The session lives in a ref and the ruler is repainted from an animation
 * frame, because a pointer at 120Hz would otherwise put React's reconciler
 * inside the gesture for no gain — the structure is settled, only numbers move.
 * What goes through state is what changes structure: whether the ruler is
 * mounted, and the value the readout shows.
 */
function useAdjustment({
  adjustable,
  canStep,
  bumpBy,
  commit,
  valueRef,
  setValue,
  onCancel,
  inputRef,
}: AdjustmentOptions) {
  const session = useRef<AdjustmentSession | null>(null);
  const press = useRef<PressSession | null>(null);
  const repeatDelay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeatTick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [scrub, setScrub] = useState<ScrubFrame | null>(null);
  const [active, setActive] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [readout, setReadout] = useState<string | null>(null);

  const stopRepeating = useEvent(() => {
    clearTimeout(repeatDelay.current);
    clearInterval(repeatTick.current);
    repeatDelay.current = undefined;
    repeatTick.current = undefined;
  });

  /**
   * Opens the interaction. Fires for a press anywhere in a scrub handle — the
   * chevrons bubble into it, since they deliberately leave the event alone.
   */
  const beginScrub = useEvent((event: ReactPointerEvent) => {
    if (event.defaultPrevented || !adjustable || event.button) return;
    session.current = {
      dy: 0,
      tier: 0,
      progress: 0,
      from: SCRUB_BASE_SPACING,
      to: SCRUB_BASE_SPACING,
      since: 0,
      moved: 0,
      engaged: false,
      origin: valueRef.current,
    };
    setActive(true);
  });

  /**
   * Records which chevron is down and starts its hold.
   *
   * Runs before `beginScrub`, because the button is inside the scrub handle and
   * the event reaches the target first. It deliberately does not open the
   * session: the scrub handle does that for every press alike.
   */
  const beginPress = useEvent((towards: 1 | -1, event: ReactPointerEvent) => {
    if (event.defaultPrevented || !adjustable || event.button || !canStep(towards)) return;
    stopRepeating();
    press.current = { towards, repeated: false };
    repeatDelay.current = setTimeout(() => {
      const held = press.current;
      if (!held) return;
      held.repeated = true;
      const tick = () => {
        if (!press.current || !canStep(held.towards)) {
          stopRepeating();
          return;
        }
        bumpBy(held.towards, held.towards > 0 ? "increment-press" : "decrement-press");
      };
      tick();
      repeatTick.current = setInterval(tick, STEP_REPEAT_INTERVAL);
    }, STEP_REPEAT_DELAY);
  });

  /**
   * Closes the interaction, and is the only place a commit is emitted for it.
   *
   * Base UI's scrub area commits on every release whether or not anything
   * moved, and always as `scrub`. Both are wrong here — a click on a prefix is
   * not an edit, and a chevron press is not a scrub — so that commit is dropped
   * at the root and this one replaces it.
   */
  const end = useEvent(() => {
    const current = session.current;
    const held = press.current;
    stopRepeating();
    session.current = null;
    press.current = null;
    setActive(false);
    setEngaged(false);
    if (!current) return;

    // A press that never travelled and never repeated is a click: one step.
    if (held && !held.repeated && !current.engaged && canStep(held.towards)) {
      bumpBy(held.towards, held.towards > 0 ? "increment-press" : "decrement-press");
    }
    if (valueRef.current === current.origin) return;
    commit(
      valueRef.current,
      current.engaged
        ? "scrub"
        : held
          ? held.towards > 0
            ? "increment-press"
            : "decrement-press"
          : "none",
    );
  });

  const cancel = useEvent(() => {
    const origin = session.current?.origin ?? null;
    const changed = origin !== valueRef.current;
    stopRepeating();
    session.current = null;
    press.current = null;
    setActive(false);
    setEngaged(false);
    if (!changed) return;
    setValue(origin, "none");
    onCancel?.(origin);
  });

  useEffect(() => {
    if (!active) return undefined;
    const input = inputRef.current;
    const view = input?.ownerDocument.defaultView;
    if (!view) return undefined;

    let frame = 0;

    /** The pitch part-way through its ease, so a band change is not a jump. */
    const pitch = (now: number) => {
      const current = session.current;
      if (!current) return SCRUB_BASE_SPACING;
      const elapsed = now - current.since;
      if (elapsed >= SCRUB_SPACING_TRANSITION) return current.to;
      const t = elapsed / SCRUB_SPACING_TRANSITION;
      // easeOutCubic, matching the Flutter field's spacing transition.
      const eased = 1 - (1 - t) ** 3;
      return current.from + (current.to - current.from) * eased;
    };

    const handleMove = (event: PointerEvent) => {
      const current = session.current;
      if (!current) return;
      const now = performance.now();

      current.moved += Math.abs(event.movementX) + Math.abs(event.movementY);
      current.dy += event.movementY;

      const tier = nextScrubTier(current.tier, current.dy);
      if (tier !== current.tier) {
        current.from = pitch(now);
        current.to = scrubSpacing(tier);
        current.since = now;
        current.tier = tier;
      }

      if (current.moved < SCRUB_ACTIVATION_DISTANCE) return;
      if (!current.engaged) {
        // The drag has won the interaction. Any chevron held under the pointer
        // gives it up now, before its hold could fire a step nobody asked for.
        current.engaged = true;
        press.current = null;
        stopRepeating();
        setEngaged(true);
      }
      current.progress = advanceScrub({
        progress: current.progress,
        deltaX: event.movementX,
        spacing: pitch(now),
        canStep,
        applySteps: (steps) => bumpBy(steps, "scrub"),
      });
    };

    const handleUp = () => end();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    };

    // Capture, so a scrub that runs off the field still steers it, and so the
    // session ends even if something downstream stops the release.
    view.addEventListener("pointermove", handleMove, true);
    view.addEventListener("pointerup", handleUp, true);
    view.addEventListener("pointercancel", handleUp, true);
    view.addEventListener("keydown", handleKey, true);

    const paint = () => {
      const current = session.current;
      // Nothing is drawn until the drag has won: a press that turns out to be
      // a click must not flash a ruler and a readout on its way past.
      if (current?.engaged) {
        const spacing = pitch(performance.now());
        setScrub((previous) =>
          previous && previous.progress === current.progress && previous.spacing === spacing
            ? previous
            : { progress: current.progress, spacing, phase: "in" },
        );
        setReadout(inputRef.current?.value ?? null);
      }
      frame = view.requestAnimationFrame(paint);
    };
    frame = view.requestAnimationFrame(paint);

    return () => {
      view.cancelAnimationFrame(frame);
      view.removeEventListener("pointermove", handleMove, true);
      view.removeEventListener("pointerup", handleUp, true);
      view.removeEventListener("pointercancel", handleUp, true);
      view.removeEventListener("keydown", handleKey, true);
    };
  }, [active, canStep, bumpBy, end, cancel, stopRepeating, inputRef]);

  useEffect(() => stopRepeating, [stopRepeating]);

  /*
   * The ruler outlives the gesture by one fade. Keeping it mounted through the
   * exit is what lets the value fade back in rather than snap; the ruler itself
   * says when that fade is done, so the duration stays a token rather than
   * being a number repeated here.
   */
  const dropRuler = useCallback(() => {
    setScrub((previous) => (previous?.phase === "out" ? null : previous));
  }, []);

  useEffect(() => {
    if (engaged || scrub === null || scrub.phase === "out") return undefined;
    setScrub({ ...scrub, phase: "out" });
    // A transition that never runs never ends, and a theme is free to zero the
    // duration, so the fade's own signal gets a backstop rather than a rival.
    const backstop = setTimeout(dropRuler, 1000);
    return () => clearTimeout(backstop);
  }, [engaged, scrub, dropRuler]);

  useEffect(() => {
    if (!engaged) setReadout(null);
  }, [engaged]);

  return {
    scrub,
    engaged,
    beginScrub,
    beginPress,
    dropRuler,
    readout: engaged ? readout : null,
  };
}

/**
 * Wheel stepping, owned here rather than taken from `allowWheelScrub`.
 *
 * Base UI's version steps by `largeStep` on shift, which this field does not
 * have. The rest is the same shape: only while focused, only on the vertical
 * axis, and never under a modifier — ctrl is the browser's zoom, and the others
 * are reserved for nothing, which is the point.
 */
function useWheelStepping({
  inputRef,
  adjustable,
  canStep,
  bumpBy,
  commit,
  valueRef,
}: {
  inputRef: { current: HTMLInputElement | null };
  adjustable: boolean;
  canStep: (towards: 1 | -1) => boolean;
  bumpBy: (steps: number, reason: NumberFieldRoot.ChangeEventReason) => void;
  commit: (value: number | null, reason: NumberFieldRoot.CommitEventReason) => void;
  valueRef: { current: number | null };
}) {
  const burst = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const input = inputRef.current;
    if (!adjustable || !input) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
      if (input.ownerDocument.activeElement !== input) return;
      const { deltaX, deltaY } = event;
      if (deltaY === 0 || Math.abs(deltaY) < Math.abs(deltaX)) return;

      const towards = (deltaY < 0 ? 1 : -1) as 1 | -1;
      if (!canStep(towards)) return;

      // Non-passive, so the page does not scroll out from under the field.
      event.preventDefault();
      bumpBy(towards, "wheel");

      // One flick of a wheel is many events; the interaction is the burst.
      clearTimeout(burst.current);
      burst.current = setTimeout(() => commit(valueRef.current, "wheel"), WHEEL_COMMIT_DELAY);
    };

    input.addEventListener("wheel", handleWheel, { passive: false });
    return () => input.removeEventListener("wheel", handleWheel);
  }, [inputRef, adjustable, canStep, bumpBy, commit, valueRef]);

  useEffect(() => () => clearTimeout(burst.current), []);
}

/**
 * Escape abandons the edit and restores the value the field had when it took
 * focus, which is the other half of `onValueCommitted`: every interaction ends
 * either committed or cancelled, and the user can always get back.
 *
 * Skipped while scrubbing, where the gesture has a nearer origin of its own.
 */
function useEscapeRevert({
  inputRef,
  value,
  valueRef,
  setValue,
  onCancel,
  scrubbing,
}: {
  inputRef: { current: HTMLInputElement | null };
  value: number | null;
  valueRef: { current: number | null };
  setValue: (value: number | null, reason: NumberFieldRoot.ChangeEventReason) => void;
  onCancel: ((value: number | null) => void) | undefined;
  scrubbing: boolean;
}) {
  const origin = useRef<number | null>(value);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return undefined;

    const handleFocus = () => {
      origin.current = valueRef.current;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || scrubbing || event.defaultPrevented) return;
      const restored = origin.current;
      if (restored === valueRef.current) {
        input.blur();
        return;
      }
      event.preventDefault();
      setValue(restored, "none");
      onCancel?.(restored);
      input.blur();
    };

    input.addEventListener("focus", handleFocus);
    input.addEventListener("keydown", handleKeyDown);
    return () => {
      input.removeEventListener("focus", handleFocus);
      input.removeEventListener("keydown", handleKeyDown);
    };
  }, [inputRef, valueRef, setValue, onCancel, scrubbing]);
}

/* -------------------------------------------------------------------------
 * Parts
 * ---------------------------------------------------------------------- */

/**
 * A region of the field that scrubs when dragged.
 *
 * `ScrubArea` is kept for what only it can do — pointer lock, and a virtual
 * cursor that wraps at the viewport edge instead of stopping at it, so a long
 * drag is never cut short by the screen. Its increment rule is switched off;
 * `useAdjustment` reads the same pointer stream and applies ClaraLight's.
 */
function ScrubHandle({
  enabled,
  engaged,
  onScrubStart,
  className,
  children,
}: {
  enabled: boolean;
  /** Whether the drag has won the interaction; a press alone shows nothing. */
  engaged: boolean;
  onScrubStart: (event: ReactPointerEvent) => void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <NumberField.ScrubArea
      pixelSensitivity={SCRUB_SENSITIVITY_OFF}
      onPointerDown={onScrubStart}
      className={cn(className, enabled && "cursor-ew-resize")}
    >
      {children}
      {/*
       * Base UI shows this the moment a pointer goes down, since that is when
       * it takes the pointer lock. Here the lock is taken before the
       * interaction has been decided, so the cursor waits for the drag — a
       * click on a chevron must not blink a scrub cursor on its way past.
       */}
      <NumberField.ScrubAreaCursor className={cn(!engaged && "invisible")}>
        <ResizeCursor />
      </NumberField.ScrubAreaCursor>
    </NumberField.ScrubArea>
  );
}

/** The horizontal-resize pointer, drawn because pointer lock hides the real one. */
function ResizeCursor() {
  return (
    <svg width="26" height="14" viewBox="0 0 26 14" fill="none" aria-hidden="true">
      <title>Scrub</title>
      <path
        d="M19.5 3.5 24 7l-4.5 3.5M6.5 3.5 2 7l4.5 3.5M3 7h20"
        stroke="var(--cl-background)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 3.5 24 7l-4.5 3.5M6.5 3.5 2 7l4.5 3.5M3 7h20"
        stroke="var(--cl-foreground)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The two chevrons at the trailing edge, and the strip they sit in.
 *
 * The whole strip is a scrub handle, the chevrons included. That is the point:
 * a field with no prefix has nothing else to grab, and the few pixels of strip
 * around two 18x10 buttons are not a drag target anyone could hit. The press
 * and the drag are arbitrated by distance in `useAdjustment` rather than by
 * region, so a chevron can be clicked, held, or dragged from.
 */
function Stepper({
  axis,
  leading,
  enabled,
  engaged,
  controls,
  canStep,
  onScrubStart,
  onPress,
}: {
  axis: "vertical" | "horizontal";
  leading: 1 | -1;
  enabled: boolean;
  engaged: boolean;
  /** The input the buttons drive, for `aria-controls`. */
  controls: string;
  canStep: (towards: 1 | -1) => boolean;
  onScrubStart: (event: ReactPointerEvent) => void;
  onPress: (towards: 1 | -1, event: ReactPointerEvent) => void;
}) {
  return (
    <ScrubHandle
      enabled={enabled}
      engaged={engaged}
      onScrubStart={onScrubStart}
      className="flex shrink-0 items-center self-stretch"
    >
      <span
        className={cn(
          "flex w-(--cl-number-stepper-width)",
          axis === "vertical" ? "flex-col" : "flex-row",
        )}
      >
        <ChevronButton
          axis={axis}
          towards={leading}
          pointing={axis === "vertical" ? "up" : "left"}
          enabled={enabled && canStep(leading)}
          controls={controls}
          onPress={onPress}
        />
        <ChevronButton
          axis={axis}
          towards={-leading as 1 | -1}
          pointing={axis === "vertical" ? "down" : "right"}
          enabled={enabled && canStep(-leading as 1 | -1)}
          controls={controls}
          onPress={onPress}
        />
      </span>
    </ScrubHandle>
  );
}

/** One slot per chevron, so the strip is addressable from a test or a theme. */
const STEP_SLOT = {
  up: "number-input-step-up",
  down: "number-input-step-down",
  left: "number-input-step-left",
  right: "number-input-step-right",
} as const;

/**
 * One chevron.
 *
 * A plain button rather than `NumberField.Increment`, for one reason: Base UI's
 * stepper calls `preventDefault()` on pointer-down, and `ScrubArea` stands down
 * on anything already default-prevented — so a chevron built from it can never
 * be dragged from. Leaving the event alone is what lets the same press become
 * either a step or a scrub.
 *
 * It follows that the stepping is ours too, and it happens on release: see
 * `useAdjustment`, which also owns the hold.
 *
 * At a bound the button is `aria-disabled` rather than `disabled`. A disabled
 * button dispatches no pointer events at all, which would put a dead patch in
 * the middle of the scrub handle exactly when the user wants to drag the other
 * way — the state has to be announced without taking the surface away.
 */
function ChevronButton({
  axis,
  towards,
  pointing,
  enabled,
  controls,
  onPress,
}: {
  axis: "vertical" | "horizontal";
  towards: 1 | -1;
  pointing: NumberInputDirection;
  enabled: boolean;
  controls: string;
  onPress: (towards: 1 | -1, event: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      data-cl-slot={STEP_SLOT[pointing]}
      // Keyboard users step from the input itself, which carries the spinbutton
      // semantics; the buttons are a pointer affordance and stay out of the
      // tab order, as Base UI's own steppers do.
      tabIndex={-1}
      aria-label={towards > 0 ? "Increase" : "Decrease"}
      aria-controls={controls}
      aria-disabled={!enabled || undefined}
      data-disabled={!enabled || undefined}
      onPointerDown={(event) => onPress(towards, event)}
      className={cn(
        "flex items-center justify-center text-foreground-secondary select-none",
        "transition-colors duration-(--cl-duration-fast) ease-cl-out",
        "hover:text-foreground data-[disabled]:text-foreground-disabled",
        // One button is `step-width` across the strip and `step-height` along
        // it; a horizontal stepper is the same pair turned a quarter turn.
        axis === "vertical"
          ? "h-(--cl-number-step-height) w-(--cl-number-step-width)"
          : "h-(--cl-number-step-width) w-(--cl-number-step-height)",
      )}
    >
      <Chevron pointing={pointing} />
    </button>
  );
}

/**
 * The glyph, per direction: its drawing box and the stroke inside it.
 *
 * These are not theme tokens and should not be. They are the coordinates of a
 * drawing — the box exists to give the path a frame — and the path itself is
 * meaningless outside it, so splitting the two would leave a token nobody could
 * change safely. The size the glyph is *placed* at is the theme's, above.
 */
const CHEVRON = {
  up: { boxWidth: 8, boxHeight: 4.5, box: "0 0 8 4.5", d: "M0.7 3.8 L4 0.7 L7.3 3.8" },
  down: { boxWidth: 8, boxHeight: 4.5, box: "0 0 8 4.5", d: "M0.7 0.7 L4 3.8 L7.3 0.7" },
  left: { boxWidth: 4.5, boxHeight: 8, box: "0 0 4.5 8", d: "M3.8 0.7 L0.7 4 L3.8 7.3" },
  right: { boxWidth: 4.5, boxHeight: 8, box: "0 0 4.5 8", d: "M0.7 0.7 L3.8 4 L0.7 7.3" },
} as const;

function Chevron({ pointing }: { pointing: NumberInputDirection }) {
  const { boxWidth, boxHeight, box, d } = CHEVRON[pointing];

  return (
    <svg width={boxWidth} height={boxHeight} viewBox={box} aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The ruler drawn under the pointer while scrubbing.
 *
 * Canvas rather than SVG: at the finest pitch a field holds dozens of ticks,
 * each with its own opacity, and repainting that as elements would be a
 * reconciliation pass per frame for marks nobody can click.
 *
 * Ticks stop where the value does. Past `min` or `max` there is no step left to
 * take, so drawing a tick there would promise one — the range is visible in the
 * gesture instead of being discovered by pushing into a wall.
 */
function ScrubRuler({
  progress,
  spacing,
  increase,
  decrease,
  revealed,
  onFadedOut,
}: {
  progress: number;
  spacing: number;
  increase: number | null;
  decrease: number | null;
  revealed: boolean;
  /** Called once the exit fade has played, so the ruler can be dropped. */
  onFadedOut: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = getComputedStyle(canvas).color;
    context.lineCap = "round";

    const center = width / 2;
    const half = Math.max(1, center);
    const lineHeight = height * 0.55;
    const top = (height - lineHeight) / 2;
    const bottom = top + lineHeight;
    const phase = progress * spacing;
    const count = Math.ceil(width / spacing) + 2;

    context.lineWidth = 1;
    for (let index = -count; index <= count; index += 1) {
      if (increase !== null && index < -increase) continue;
      if (decrease !== null && index > decrease) continue;
      const x = center + phase + index * spacing;
      if (x < -spacing || x > width + spacing) continue;
      // Ticks fade out towards the edges so the eye stays on the centre line,
      // which is the only one that means anything.
      const distance = Math.min(1, Math.abs(x - center) / half);
      const opacity = (1 - distance) ** 1.65 * 0.72;
      if (opacity <= 0.01) continue;
      context.globalAlpha = opacity;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.stroke();
    }

    context.lineWidth = 1.25;
    context.globalAlpha = 0.96;
    context.beginPath();
    context.moveTo(center, top);
    context.lineTo(center, bottom);
    context.stroke();
  }, [progress, spacing, increase, decrease]);

  return (
    /*
     * The canvas is wrapped rather than hidden directly: an empty `<canvas>` is
     * an interactive element as far as ARIA is concerned, so the decoration is
     * declared on a box around it. The ruler restates the value the input
     * already announces, and the input is what should be read during a scrub.
     */
    <span
      aria-hidden="true"
      onTransitionEnd={revealed ? undefined : onFadedOut}
      data-cl-slot="number-input-ruler"
      className={cn(
        "pointer-events-none absolute inset-0 text-foreground",
        "transition-opacity ease-cl-out motion-reduce:duration-(--cl-duration-reduced)",
        revealed
          ? "opacity-100 duration-(--cl-duration-fast)"
          : "opacity-0 duration-(--cl-duration-exit)",
      )}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </span>
  );
}

/**
 * The value, shown above the field while it is being scrubbed.
 *
 * A tooltip and not a popover: this is a readout nobody can interact with, and
 * a popover would take focus away from the field the gesture is driving. The
 * surface is `AnchoredSurface`, so the tail is part of the shape and the whole
 * thing grows out of the point it is aiming at — the same construction as
 * `Popover` and `Tooltip`.
 *
 * Digits roll rather than swap, through Scritto, which is the web's equivalent
 * of the numeric-text content transition the Flutter overlay uses. Only the
 * digits that changed move; the unit beside them holds still.
 */
function ScrubReadout({
  anchor,
  open,
  value,
  suffix,
}: {
  anchor: { current: HTMLElement | null };
  open: boolean;
  value: string;
  suffix: ReactNode;
}) {
  const positionerRef = useRef<HTMLDivElement>(null);
  const margin = useThemedNumber(positionerRef, "--cl-anchor-margin");

  return (
    <Tooltip.Root open={open} trackCursorAxis="none">
      <Tooltip.Portal keepMounted={false}>
        <Tooltip.Positioner
          ref={positionerRef}
          anchor={anchor}
          side="top"
          align="center"
          sideOffset={() => themedNumber(positionerRef.current, "--cl-anchor-gap") ?? 0}
          collisionPadding={margin}
          sticky
          className="pointer-events-none z-50 outline-none"
        >
          <AnchoredSurface asChild radius="panel" side="top" wrapperClassName="w-fit">
            <Tooltip.Popup
              aria-hidden="true"
              data-cl-slot="number-input-readout"
              className={cn(
                "cl-exit-sentinel cl-frost border-outline-strong shadow-none",
                "flex min-w-20 items-baseline justify-center whitespace-nowrap",
                "[--cl-anchored-padding-x:var(--cl-number-readout-padding-x)]",
                "[--cl-anchored-padding-y:var(--cl-number-readout-padding-y)]",
              )}
            >
              {/*
               * `display` and `headline` are the 30px and 18px steps the Flutter
               * overlay uses; both are borrowed into the mono family here, so
               * each takes back the weight and tracking of a numeric readout.
               */}
              <Scritto
                value={value}
                className="font-mono font-semibold text-display text-foreground tabular-nums tracking-normal"
              />
              {suffix === undefined ? null : (
                <span className="font-mono font-normal text-foreground-tertiary text-headline tracking-normal">
                  {suffix}
                </span>
              )}
              <Tooltip.Arrow data-cl-anchor-probe="" className="cl-anchor-probe" />
            </Tooltip.Popup>
          </AnchoredSurface>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
