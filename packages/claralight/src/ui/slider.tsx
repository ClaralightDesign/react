"use client";

import Scritto from "@scritto/react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { surfacePath } from "@/lib/anchored";
import { cn } from "@/lib/utils";

/**
 * A Claralight slider.
 *
 * The rail is not one bar with a knob on top of it: it is three separate
 * pieces — the active line, the handle, and the track the handle has not
 * reached — each standing a gap apart, the same figure Progress draws.
 *
 * The handle is a flat capsule at rest. Under the pointer it narrows into a
 * line, so the thing that marks the value gets thinner exactly when a pointer
 * is there to place it precisely, and thickens again while dragging.
 *
 * Give it a valueLabel and the pinch has somewhere to go: the material
 * squeezed out of the capsule rises into a bubble carrying the value, tethered
 * to the handle like a balloon on a string — its foot stays over the handle
 * and its body trails behind the drag, swinging back when the drag stops.
 *
 * snapPoints give the rail places the handle is drawn to. The pull is soft:
 * no value is ever out of reach, the handle only grows heavy over a point and
 * breaks free once the pointer has pushed far enough past it — snapRadius is
 * how far that is, and so how strong the magnet feels. step is the
 * hard version of the same idea — a grid the handle springs between, with
 * nothing in the gaps — and the two are alternatives, not layers.
 */

export interface SliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** The current value of the slider. (Controlled) */
  value?: number;
  /** The default value of the slider when uncontrolled. Defaults to min. */
  defaultValue?: number;
  /** Callback fired when the value changes. */
  onValueChange?: (value: number) => void;
  /** Minimum value. Defaults to 0. */
  min?: number;
  /** Maximum value. Defaults to 1. */
  max?: number;
  /**
   * Spacing of a grid the handle may only come to rest on, in the slider's own units.
   * Null or undefined is continuous rail.
   */
  step?: number;
  /**
   * Values the handle is pulled toward as it passes them, in the slider's own units.
   * Magnetic detents rather than a grid.
   */
  snapPoints?: number[];
  /**
   * Magnetic snap radius in logical pixels. Defaults to 14.
   */
  snapRadius?: number;
  /**
   * Formats the value for the bubble lifted over the handle.
   * If null or undefined, no bubble is shown.
   */
  valueLabel?: (value: number) => string;
  /**
   * Fill color of the active track. Defaults to theme accent.
   */
  activeColor?: string;
  /**
   * Step amount per arrow key press when step is not set. Defaults to 5% of range.
   */
  keyboardStep?: number;
  /** Whether the slider is disabled. */
  disabled?: boolean;
  /** Autofocus when mounted. */
  autoFocus?: boolean;
}

const TRACK_HEIGHT = 6;
const THUMB_WIDTH = 20;
const THUMB_HEIGHT = 12;
const HOVER_LINE_WIDTH = 3;
const HOVER_LINE_HEIGHT = 20;
const PRESS_LINE_WIDTH = 2.5;
const PRESS_LINE_HEIGHT = 18;
const GAP = 4;
const SNAP_DOT_DIAMETER = 2.5;
const HOVER_WIDTH = 28;
const HIT_HEIGHT = 32;
const DEFAULT_SNAP_RADIUS = 14;
const SNAP_HOLD_SHARE = 0.5;
const BUBBLE_TAIL_EXTENT = 5;
const BUBBLE_TAIL_HALF_WIDTH = 7;
const BUBBLE_TIP_CLEARANCE = 2;
const BALLOON_STIFFNESS = 200;
const BALLOON_DAMPING = 20;
const BUBBLE_INK = "#1A1A1A";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Quantize to nearest step on grid with max always standing as the last valid stop.
 */
function quantize(value: number, min: number, max: number, step?: number): number {
  if (step == null || step <= 0) return value;
  const last = Math.floor((max - min) / step);
  const index = clamp(Math.round((value - min) / step), 0, last);
  const onGrid = min + index * step;
  return Math.abs(max - value) < Math.abs(value - onGrid) ? max : onGrid;
}

/**
 * Closed-form solution of underdamped/critically-damped/overdamped spring physics.
 */
interface SpringState {
  x: number;
  v: number;
}

function solveSpring(
  x0: number,
  v0: number,
  target: number,
  dt: number,
  mass: number,
  stiffness: number,
  damping: number,
): SpringState {
  const p0 = x0 - target;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));

  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const c1 = p0;
    const c2 = (v0 + zeta * w0 * p0) / wd;
    const exp = Math.exp(-zeta * w0 * dt);
    const cos = Math.cos(wd * dt);
    const sin = Math.sin(wd * dt);
    const x = target + exp * (c1 * cos + c2 * sin);
    const v = -zeta * w0 * exp * (c1 * cos + c2 * sin) + exp * (-c1 * wd * sin + c2 * wd * cos);
    return { x, v };
  } else if (Math.abs(zeta - 1) < 1e-4) {
    const c1 = p0;
    const c2 = v0 + w0 * p0;
    const exp = Math.exp(-w0 * dt);
    const x = target + exp * (c1 + c2 * dt);
    const v = exp * (c2 - w0 * (c1 + c2 * dt));
    return { x, v };
  } else {
    const gamma = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + gamma;
    const r2 = -zeta * w0 - gamma;
    const c2 = (v0 - r1 * p0) / (r2 - r1);
    const c1 = p0 - c2;
    const x = target + c1 * Math.exp(r1 * dt) + c2 * Math.exp(r2 * dt);
    const v = c1 * r1 * Math.exp(r1 * dt) + c2 * r2 * Math.exp(r2 * dt);
    return { x, v };
  }
}

export function Slider({
  value: controlledValue,
  defaultValue,
  onValueChange,
  min = 0,
  max = 1,
  step,
  snapPoints,
  snapRadius = DEFAULT_SNAP_RADIUS,
  valueLabel,
  activeColor,
  keyboardStep,
  disabled = false,
  autoFocus = false,
  className,
  ...restProps
}: SliderProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(
    () => defaultValue ?? min,
  );
  const isControlled = controlledValue !== undefined;
  const rawValue = isControlled ? controlledValue : uncontrolledValue;
  const currentValue = clamp(rawValue, min, max);

  const containerRef = useRef<HTMLDivElement>(null);
  const focusOnMount = useRef(autoFocus && !disabled);
  useEffect(() => {
    if (focusOnMount.current) containerRef.current?.focus();
  }, []);
  const measureRef = useRef<HTMLDivElement>(null);
  const [bubbleSize, setBubbleSize] = useState({ width: 32, height: 22 });
  const [overlayStyles, setOverlayStyles] = useState<CSSProperties>({});
  const [overlayOrigin, setOverlayOrigin] = useState<{ left: number; top: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [tilt, setTilt] = useState(0);
  const [pointerRevision, setPointerRevision] = useState(0);
  const animationRef = useRef({ hover: 0, focus: 0 });
  const [layoutWidth, setLayoutWidth] = useState(300);

  // Interaction states
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [keyboardBubble, setKeyboardBubble] = useState(false);

  // Animation values
  const [hoverAnim, setHoverAnim] = useState(0);
  const [pressAnim, setPressAnim] = useState(0);
  const [focusAnim, setFocusAnim] = useState(0);

  // Visual track fraction
  const currentFraction = (currentValue - min) / (max - min || 1);
  const [visualFraction, setVisualFraction] = useState(currentFraction);

  // Physics refs
  const visualSpringRef = useRef({ x: currentFraction, v: 0, target: currentFraction });
  const balloonPhysicsRef = useRef({ x: THUMB_WIDTH / 2 + (300 - THUMB_WIDTH) * currentFraction, v: 0, tilt: 0, active: false, initialized: false });
  const pressSpringRef = useRef({ x: 0, v: 0, target: 0 });
  const keyboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const isPointerDownRef = useRef(false);
  const pointerPosRef = useRef<number | null>(null);

  // Update layout width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const computed = getComputedStyle(el);
      const inherited: Record<string, string> = { fontFamily: computed.fontFamily, direction: computed.direction };
      for (const property of Array.from(computed)) {
        if (property.startsWith("--")) inherited[property] = computed.getPropertyValue(property);
      }
      setOverlayStyles((prev) => JSON.stringify(prev) === JSON.stringify(inherited) ? prev : inherited);
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setLayoutWidth(rect.width);
      setOverlayOrigin((prev) => prev?.left === rect.left && prev.top === rect.top ? prev : { left: rect.left, top: rect.top });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    observer.observe(document.body);
    // Layout shifts can move the anchor without resizing it or scrolling.
    const layoutObserver = typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("layout-shift")
      ? new PerformanceObserver(updateSize)
      : null;
    layoutObserver?.observe({ type: "layout-shift" });
    const themeObserver = new MutationObserver(updateSize);
    for (let ancestor: HTMLElement | null = el; ancestor; ancestor = ancestor.parentElement) {
      themeObserver.observe(ancestor, { attributes: true, attributeFilter: ["class", "style", "dir", "data-theme"] });
    }
    window.addEventListener("scroll", updateSize, true);
    window.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("resize", updateSize);
    window.visualViewport?.addEventListener("scroll", updateSize);
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
      layoutObserver?.disconnect();
      window.removeEventListener("scroll", updateSize, true);
      window.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("resize", updateSize);
      window.visualViewport?.removeEventListener("scroll", updateSize);
    };
  }, []);

  const changeValue = useCallback(
    (nextVal: number) => {
      if (disabled) return;
      if (!isControlled) {
        setUncontrolledValue(nextVal);
      }
      onValueChange?.(nextVal);
    },
    [disabled, isControlled, onValueChange],
  );

  // Synchronize target fraction when currentValue changes
  useEffect(() => {
    const target = clamp((currentValue - min) / (max - min || 1), 0, 1);
    visualSpringRef.current.target = target;
    if (tracking && step == null) {
      visualSpringRef.current.x = target;
      visualSpringRef.current.v = 0;
      setVisualFraction(target);
    }
  }, [currentValue, min, max, tracking, step]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      if (query.matches) {
        balloonPhysicsRef.current.v = 0;
        balloonPhysicsRef.current.tilt = 0;
        balloonPhysicsRef.current.active = false;
        setTilt(0);
      }
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const hasValueLabel = valueLabel != null;
  useEffect(() => {
    if (disabled || !hasValueLabel) {
      setKeyboardBubble(false);
      if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
      keyboardTimerRef.current = null;
    }
  }, [disabled, hasValueLabel]);

  useEffect(() => () => {
    if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
  }, []);

  // Main animation / physics loop
  useEffect(() => {
    let animId: number;
    lastTimeRef.current = null;

    const frame = (time: number) => {
      if (lastTimeRef.current == null) {
        lastTimeRef.current = time;
      }
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      // 1. Hover animation (160ms)
      const hoverTarget = hovered && !disabled ? 1 : 0;
      const focusTarget = focused && !disabled ? 1 : 0;
      const ease = (value: number, target: number) =>
        Math.abs(value - target) < 0.01 ? target : value + (target - value) * Math.min(1, dt * 12);
      animationRef.current.hover = ease(animationRef.current.hover, hoverTarget);
      setHoverAnim(animationRef.current.hover);

      // 2. Focus animation (160ms)
      animationRef.current.focus = ease(animationRef.current.focus, focusTarget);
      setFocusAnim(animationRef.current.focus);

      // 3. Press animation (Spring on release, ease on press)
      if (pressed && !disabled) {
        pressSpringRef.current.x = Math.min(1, pressSpringRef.current.x + dt * 14);
        pressSpringRef.current.v = 0;
        pressSpringRef.current.target = 1;
        setPressAnim(pressSpringRef.current.x);
      } else {
        pressSpringRef.current.target = 0;
        const res = solveSpring(
          pressSpringRef.current.x,
          pressSpringRef.current.v,
          0,
          dt,
          1,
          520,
          18,
        );
        pressSpringRef.current.x = res.x;
        pressSpringRef.current.v = res.v;
        if (Math.abs(res.x) < 0.001 && Math.abs(res.v) < 0.001) {
          pressSpringRef.current.x = 0;
          pressSpringRef.current.v = 0;
        }
        setPressAnim(pressSpringRef.current.x);
      }

      // 4. Visual fraction spring
      const vTarget = visualSpringRef.current.target;
      if (tracking && step == null) {
        visualSpringRef.current.x = vTarget;
        visualSpringRef.current.v = 0;
        setVisualFraction(vTarget);
      } else {
        const dist = Math.abs(vTarget - visualSpringRef.current.x);
        const damping =
          step != null ? 32 : 24 + 24 * Math.min(1, dist / 0.35);
        const sRes = solveSpring(
          visualSpringRef.current.x,
          visualSpringRef.current.v,
          vTarget,
          dt,
          1,
          520,
          damping,
        );
        visualSpringRef.current.x = sRes.x;
        visualSpringRef.current.v = sRes.v;
        if (Math.abs(sRes.x - vTarget) < 0.0005 && Math.abs(sRes.v) < 0.001) {
          visualSpringRef.current.x = vTarget;
          visualSpringRef.current.v = 0;
        }
        setVisualFraction(visualSpringRef.current.x);
      }

      // 5. Balloon tilt physics; rendering owns the transform.
      const pressValue = pressSpringRef.current.x;
      const curLine = Math.max(animationRef.current.hover, animationRef.current.focus, pressValue);
      const curHandleW = lerp(
        lerp(THUMB_WIDTH, HOVER_LINE_WIDTH, curLine),
        PRESS_LINE_WIDTH,
        pressValue,
      );
      const curHandleCenter =
        curHandleW / 2 +
        (layoutWidth - curHandleW) * clamp(visualSpringRef.current.x, 0, 1);

      const isDragging = isPointerDownRef.current;
      const balloon = balloonPhysicsRef.current;
      const visible = !disabled && !!valueLabel && (hovered || pressed || keyboardBubble);
      if (!balloon.initialized || !visible || reducedMotion) {
        balloon.x = curHandleCenter;
        balloon.v = 0;
        balloon.tilt = 0;
        balloon.active = false;
        balloon.initialized = true;
        setTilt(0);
      } else {
        let balloonTarget = curHandleCenter;
        if (isDragging && pointerPosRef.current != null) {
          const pointerOffset = pointerPosRef.current - curHandleCenter;
          balloonTarget = curHandleCenter + pointerOffset * 0.4;
        }

        let remaining = Math.min(dt, 0.05);
        while (remaining > 0) {
          const subStep = Math.min(remaining, 1 / 240);
          const accel =
            BALLOON_STIFFNESS * (balloonTarget - balloonPhysicsRef.current.x) -
            BALLOON_DAMPING * balloonPhysicsRef.current.v;
          balloonPhysicsRef.current.v += accel * subStep;
          balloonPhysicsRef.current.x += balloonPhysicsRef.current.v * subStep;
          remaining -= subStep;
        }

        const stringLen =
          HOVER_LINE_HEIGHT / 2 + BUBBLE_TIP_CLEARANCE + BUBBLE_TAIL_EXTENT + bubbleSize.height;
        const computedTilt = Math.atan2(
          balloonPhysicsRef.current.x - curHandleCenter,
          stringLen,
        );
        balloonPhysicsRef.current.tilt = computedTilt;

        setTilt(computedTilt);

        const settled =
          Math.abs(curHandleCenter - balloonPhysicsRef.current.x) < 0.04 &&
          Math.abs(balloonPhysicsRef.current.v) < 0.04;
        if (settled) {
          balloonPhysicsRef.current.x = curHandleCenter;
          balloonPhysicsRef.current.v = 0;
          balloonPhysicsRef.current.tilt = 0;
          balloonPhysicsRef.current.active = false;
          setTilt(0);
        } else {
          balloonPhysicsRef.current.active = true;
        }
      }

      const moving = animationRef.current.hover !== hoverTarget ||
        animationRef.current.focus !== focusTarget ||
        pressSpringRef.current.x !== (pressed && !disabled ? 1 : 0) ||
        pressSpringRef.current.v !== 0 ||
        visualSpringRef.current.x !== visualSpringRef.current.target ||
        visualSpringRef.current.v !== 0 || balloonPhysicsRef.current.active;
      if (moving) animId = requestAnimationFrame(frame);
    };

    animId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animId);
  }, [
    disabled,
    hovered,
    focused,
    pressed,
    keyboardBubble,
    tracking,
    step,
    currentValue,
    pointerRevision,
    min,
    max,
    reducedMotion,
    bubbleSize.height,
    hasValueLabel,
    layoutWidth,
  ]);

  // Current handle geometry derived from animated states
  const lineState = Math.max(hoverAnim, focusAnim, pressAnim);
  const handleWidth = lerp(
    lerp(THUMB_WIDTH, HOVER_LINE_WIDTH, lineState),
    PRESS_LINE_WIDTH,
    pressAnim,
  );
  const handleHeight = lerp(
    lerp(THUMB_HEIGHT, HOVER_LINE_HEIGHT, lineState),
    PRESS_LINE_HEIGHT,
    pressAnim,
  );

  const clampedFraction = clamp(visualFraction, 0, 1);
  const handleCenter =
    handleWidth / 2 + (layoutWidth - handleWidth) * clampedFraction;
  const handleLeft = handleCenter - handleWidth / 2;

  // Snap positions in pointer units
  const usableWidth = Math.max(1, layoutWidth - PRESS_LINE_WIDTH);
  const snapPositions = useMemo(() => {
    if (step != null || !snapPoints || snapPoints.length === 0) return [];
    const span = max - min || 1;
    return snapPoints.map(
      (p) => ((clamp(p, min, max) - min) / span) * usableWidth,
    );
  }, [step, snapPoints, min, max, usableWidth]);

  // Magnetize detent logic
  const magnetize = useCallback(
    (x: number): number => {
      if (snapPositions.length === 0) return x;
      const first = snapPositions[0];
      if (first === undefined) return x;
      let nearest = first;
      let minDist = Math.abs(x - nearest);
      for (let i = 1; i < snapPositions.length; i++) {
        const p = snapPositions[i];
        if (p === undefined) continue;
        const d = Math.abs(x - p);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
      if (minDist >= snapRadius) return x;
      const hold = snapRadius * SNAP_HOLD_SHARE;
      if (minDist <= hold) return nearest;
      const offset =
        ((snapRadius * (minDist - hold)) / (snapRadius - hold)) *
        (x < nearest ? -1 : 1);
      return Math.abs(offset) < 0.5 ? nearest : nearest + offset;
    },
    [snapPositions, snapRadius],
  );

  // Pointer position update
  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (disabled) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const localX = clientX - rect.left - PRESS_LINE_WIDTH / 2;
      pointerPosRef.current = clientX - rect.left;
      setPointerRevision((revision) => revision + 1);
      const magnetizedX = magnetize(localX);
      const frac = clamp(magnetizedX / usableWidth, 0, 1);
      const raw = min + frac * (max - min);
      const quantized = quantize(raw, min, max, step);
      changeValue(quantized);
    },
    [disabled, magnetize, usableWidth, min, max, step, changeValue],
  );

  // Pointer event handlers
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    isPointerDownRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setPressed(true);
    setTracking(true);
    balloonPhysicsRef.current.active = true;
    updateFromPointer(e.clientX);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    balloonPhysicsRef.current.active = true;
    updateFromPointer(e.clientX);
  };

  const handlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    pointerPosRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if capture was already released
    }
    setPressed(false);
    setTracking(false);

    // Sync hover after drag
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const localX = e.clientX - rect.left;
      const isOver =
        localX >= handleCenter - HOVER_WIDTH / 2 &&
        localX <= handleCenter + HOVER_WIDTH / 2;
      setHovered(isOver);
    }
  };

  // Keyboard support
  const triggerKeyboardBubble = useCallback(() => {
    if (!valueLabel || disabled) return;
    if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
    setKeyboardBubble(true);
    balloonPhysicsRef.current.active = true;
    keyboardTimerRef.current = setTimeout(() => {
      keyboardTimerRef.current = null;
      setKeyboardBubble(false);
    }, 1000);
  }, [valueLabel, disabled]);

  const stepValue = useCallback(
    (direction: number, isLarge = false) => {
      if (disabled) return;
      const span = max - min;
      let next: number;

      if (step != null) {
        const last = Math.floor(span / step);
        const stops: number[] = [];
        for (let i = 0; i <= last; i++) stops.push(min + i * step);
        if (Math.abs(min + last * step - max) > 1e-6) stops.push(max);

        const count = isLarge
          ? Math.max(1, Math.round((span * 0.2) / step))
          : 1;
        if (direction > 0) {
          const higher = stops.filter((s) => s > currentValue + 1e-6);
          if (higher.length === 0) next = max;
          else next = higher[Math.min(count - 1, higher.length - 1)] ?? max;
        } else {
          const lower = stops.filter((s) => s < currentValue - 1e-6);
          if (lower.length === 0) next = min;
          else next = lower[Math.max(0, lower.length - count)] ?? min;
        }
      } else {
        const singleStep = keyboardStep ?? span * 0.05;
        const amount = isLarge ? Math.max(singleStep, span * 0.2) : singleStep;
        const raw = clamp(currentValue + amount * direction, min, max);
        const clean = Math.round(raw * 1e6) / 1e6;

        let target = clean;
        if (snapPoints && snapPoints.length > 0) {
          const holdShare =
            (snapRadius * SNAP_HOLD_SHARE / usableWidth) * span;
          for (const p of snapPoints) {
            const clampedP = clamp(p, min, max);
            if (
              Math.abs(clean - clampedP) <= holdShare &&
              Math.abs(currentValue - clampedP) > 1e-6
            ) {
              target = clampedP;
              break;
            }
          }
        }
        next = target;
      }

      if (Math.abs(next - currentValue) > 1e-9) {
        changeValue(next);
      }
      triggerKeyboardBubble();
    },
    [
      disabled,
      min,
      max,
      step,
      currentValue,
      keyboardStep,
      snapPoints,
      snapRadius,
      usableWidth,
      changeValue,
      triggerKeyboardBubble,
    ],
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      stepValue(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      stepValue(-1);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      stepValue(1, true);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      stepValue(-1, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      changeValue(min);
      triggerKeyboardBubble();
    } else if (e.key === "End") {
      e.preventDefault();
      changeValue(max);
      triggerKeyboardBubble();
    }
  };

  // Mark stops / fractions for rail breaks and dots
  const { breaks, dots } = useMemo(() => {
    const span = max - min || 1;
    const b: Array<[number, number]> = [
      [handleLeft - GAP, handleLeft + handleWidth + GAP],
    ];
    const d: number[] = [];

    if (step != null) {
      const last = Math.floor(span / step);
      for (let i = 1; i < last; i++) {
        const f = (i * step) / span;
        const x = PRESS_LINE_WIDTH / 2 + (layoutWidth - PRESS_LINE_WIDTH) * f;
        b.push([x - GAP / 2, x + GAP / 2]);
      }
    } else if (snapPoints && snapPoints.length > 0) {
      for (const p of snapPoints) {
        const f = (clamp(p, min, max) - min) / span;
        const x = PRESS_LINE_WIDTH / 2 + (layoutWidth - PRESS_LINE_WIDTH) * f;
        d.push(x);
        b.push([
          x - SNAP_DOT_DIAMETER / 2 - GAP,
          x + SNAP_DOT_DIAMETER / 2 + GAP,
        ]);
      }
    }

    b.sort((a, b) => a[0] - b[0]);
    return { breaks: b, dots: d };
  }, [max, min, handleLeft, handleWidth, step, snapPoints, layoutWidth]);

  // Calculate rail segments
  const segments = useMemo(() => {
    const segs: Array<{
      start: number;
      length: number;
      fill: number;
      isLeading: boolean;
    }> = [];
    let from = 0;

    const allBreaks = [...breaks, [layoutWidth, layoutWidth] as [number, number]];
    for (const [start, end] of allBreaks) {
      const s = clamp(from, 0, layoutWidth);
      const to = clamp(start, 0, layoutWidth);
      const len = to - s;
      if (len > 0) {
        const fill = Math.min(len, TRACK_HEIGHT);
        const mid = (s + to) / 2;
        segs.push({
          start: s,
          length: len,
          fill,
          isLeading: mid < handleCenter,
        });
      }
      from = Math.max(from, end);
    }
    return segs;
  }, [breaks, layoutWidth, handleCenter]);

  // Hover box bounds
  const capsuleCenter =
    THUMB_WIDTH / 2 + (layoutWidth - THUMB_WIDTH) * clampedFraction;
  const lineCenter =
    HOVER_LINE_WIDTH / 2 + (layoutWidth - HOVER_LINE_WIDTH) * clampedFraction;
  const hoverBoxLeft =
    Math.min(capsuleCenter, lineCenter) - HOVER_WIDTH / 2;
  const hoverBoxRight =
    Math.max(capsuleCenter, lineCenter) + HOVER_WIDTH / 2;
  const hoverBoxWidth = hoverBoxRight - hoverBoxLeft;

  // Active color calculation
  const resolvedActiveColor = activeColor ?? "var(--color-accent)";
  const trackColor = "var(--color-track)";
  const effectiveActiveColor = disabled
    ? "color-mix(in srgb, " + resolvedActiveColor + " 45%, transparent)"
    : resolvedActiveColor;

  // Value bubble geometry & tooltip surface curve
  const bubbleText = valueLabel ? valueLabel(currentValue) : "";
  const minLabel = valueLabel?.(min) ?? "";
  const midLabel = valueLabel?.((min + max) / 2) ?? "";
  const maxLabel = valueLabel?.(max) ?? "";
  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const sizes = Array.from(element.children, (child) => child.getBoundingClientRect());
      const width = Math.max(0, ...sizes.map((size) => size.width)) + 14;
      const height = Math.max(0, ...sizes.map((size) => size.height)) + 6;
      setBubbleSize((prev) => prev.width === width && prev.height === height ? prev : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of element.children) observer.observe(child);
    document.fonts?.addEventListener("loadingdone", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [minLabel, midLabel, maxLabel]);
  const bubbleWidth = bubbleSize.width;
  const bubbleBodyHeight = bubbleSize.height;
  const bubbleTotalHeight = bubbleBodyHeight + BUBBLE_TAIL_EXTENT;

  // Tooltip G2 continuous surfacePath curve
  const bubbleSurface = useMemo(() => {
    return surfacePath({
      width: bubbleWidth,
      height: bubbleTotalHeight,
      side: "top",
      radius: Math.min(bubbleWidth, bubbleBodyHeight) / 2,
      smoothing: 1,
      arrow: true,
      extent: BUBBLE_TAIL_EXTENT,
      arrowWidth: BUBBLE_TAIL_HALF_WIDTH * 2,
      center: bubbleWidth / 2,
    });
  }, [bubbleWidth, bubbleTotalHeight, bubbleBodyHeight]);

  const shouldShowBubble =
    valueLabel != null &&
    !disabled &&
    (hovered || pressed || keyboardBubble);

  // Flight calculation: tip is 2px above hover line
  const bubbleTipY = HIT_HEIGHT / 2 - HOVER_LINE_HEIGHT / 2 - BUBBLE_TIP_CLEARANCE;

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={disabled ? undefined : 0}
      aria-valuenow={currentValue}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={bubbleText || String(currentValue)}
      aria-orientation="horizontal"
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      onFocus={() => !disabled && setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setKeyboardBubble(false);
        if (keyboardTimerRef.current) clearTimeout(keyboardTimerRef.current);
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        "relative block w-full h-control-md select-none touch-none outline-none",
        disabled ? "cursor-default" : pressed ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      {...restProps}
    >
      <div
        ref={measureRef}
        aria-hidden="true"
        className="font-semibold text-caption"
        style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", width: "max-content", lineHeight: 1.15 }}
      >
        {Array.from(new Set([minLabel, midLabel, maxLabel])).map((label) => (
          <span key={label} style={{ display: "block", width: "max-content", whiteSpace: "pre" }}>{label}</span>
        ))}
      </div>
      {/* 1. Rail Segments */}
      {segments.map((seg) => (
        <div
          key={seg.start}
          className="absolute pointer-events-none"
          style={{
            left: seg.start + "px",
            width: seg.length + "px",
            height: seg.fill + "px",
            top: (HIT_HEIGHT - seg.fill) / 2 + "px",
            borderRadius: seg.fill / 2 + "px",
            backgroundColor: seg.isLeading ? effectiveActiveColor : trackColor,
          }}
        />
      ))}

      {/* 2. Magnetic Snap Dots */}
      {Array.from(new Set(dots)).map((dotX) => (
        <div
          key={dotX}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: dotX - SNAP_DOT_DIAMETER / 2 + "px",
            width: SNAP_DOT_DIAMETER + "px",
            height: SNAP_DOT_DIAMETER + "px",
            top: (HIT_HEIGHT - SNAP_DOT_DIAMETER) / 2 + "px",
            backgroundColor:
              dotX < handleCenter ? effectiveActiveColor : trackColor,
          }}
        />
      ))}

      {/* 3. Handle (Thumb) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: handleLeft + "px",
          width: handleWidth + "px",
          height: handleHeight + "px",
          top: (HIT_HEIGHT - handleHeight) / 2 + "px",
          borderRadius: Math.min(handleWidth, handleHeight) / 2 + "px",
          backgroundColor: disabled
            ? "color-mix(in srgb, var(--color-on-accent) 70%, transparent)"
            : "var(--color-on-accent)",
          boxShadow: focused
            ? "0 1px 6px rgba(0,0,0,0.3), 0 0 0 2px var(--color-accent), 0 0 4px 1px color-mix(in srgb, var(--color-accent) 35%, transparent)"
            : "0 1px 6px rgba(0,0,0,0.3)",
        }}
      />

      {/* 4. Hover Box (Invariant to handle narrowing) */}
      <div
        data-slot="slider-hover"
        className="absolute top-0 h-control-md"
        style={{
          left: hoverBoxLeft + "px",
          width: hoverBoxWidth + "px",
        }}
        onPointerEnter={() => !disabled && setHovered(true)}
        onPointerLeave={() => !disabled && !pressed && setHovered(false)}
      />

      {/* 5. Value Bubble with Tooltip Surface Curve, Spring Pop Entrance & Scritto */}
      {valueLabel && overlayOrigin && createPortal(
        <div
          aria-hidden="true"
          data-slot="slider-bubble"
          className="fixed pointer-events-none z-50 overflow-visible"
          style={{
            ...overlayStyles,
            pointerEvents: "none",
            left: overlayOrigin.left + handleCenter + "px",
            top: overlayOrigin.top + bubbleTipY + "px",
            transform: `translate(-50%, -100%) rotate(${reducedMotion ? 0 : tilt}rad)`,
            transformOrigin: "bottom center",
          }}
        >
          <div
            data-slot="slider-bubble-surface"
            className="relative flex items-center justify-center"
            style={{
              width: bubbleWidth + "px",
              height: bubbleTotalHeight + "px",
              filter: "drop-shadow(0 1px 6px rgba(0, 0, 0, 0.3))",
              transformOrigin: "bottom center",
              transform: reducedMotion || shouldShowBubble ? "scale(1)" : "scale(0)",
              opacity: reducedMotion ? (shouldShowBubble ? 1 : 0) : 1,
              transition: reducedMotion
                ? "opacity var(--cl-duration-fast) var(--ease-cl-out)"
                : shouldShowBubble
                  ? "transform var(--cl-duration-enter) var(--ease-cl-spring-overlay)"
                  : "transform var(--cl-duration-exit) var(--ease-cl-in)",
            }}
          >
            {/* SVG Bubble Surface with Tooltip G2 continuous curve */}
            <svg
              aria-hidden="true"
              className="absolute inset-0 w-full h-full"
              viewBox={"0 0 " + bubbleWidth + " " + bubbleTotalHeight}
            >
              <path
                d={bubbleSurface.clip}
                fill="#FFFFFF"
                fillRule="nonzero"
              />
            </svg>

            {/* Scritto Animated Text Readout */}
            <div
              className="relative z-10 flex items-center justify-center font-semibold text-caption select-none"
              style={{
                color: BUBBLE_INK,
                lineHeight: 1.15,
                whiteSpace: "pre",
                paddingBottom: BUBBLE_TAIL_EXTENT + "px",
              }}
            >
              {reducedMotion ? bubbleText : <Scritto value={bubbleText} />}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
