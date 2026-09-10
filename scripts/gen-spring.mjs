#!/usr/bin/env node
/**
 * Generates CSS `linear()` easing functions from the ClaraLight springs.
 *
 * The Flutter package drives two different springs and they are NOT
 * interchangeable — one shapes overlay/route entrances, the other the
 * release return of a pressed control. CSS can only express a spring as a
 * sampled `linear()`, so we emit the samples from the same closed-form
 * solution Flutter integrates.
 *
 * IMPORTANT — the two springs use different clocks, matching their Flutter
 * definitions, and mixing them up is an easy way to ship a wrong curve:
 *
 *   overlay  CLMotion.springOut is a `Curve`, so its time argument is
 *            *normalised progress* t in [0,1]. `omega` is per unit progress,
 *            not per second. The CSS duration is therefore free.
 *   press    CLPressable.spring is a `SpringSimulation`, so its time argument
 *            is *seconds*. Converting to normalised progress needs a chosen
 *            duration, which is why this one carries an explicit one.
 *
 * Both are emitted as `p(u)` over u in [0,1] so `linear()` can sample them
 * uniformly.
 *
 * Sources (read-only reference):
 *   claralight_ui/lib/src/theme/motion.dart       -> CLMotion.springOut
 *   claralight_ui/lib/src/surfaces/pressable.dart -> CLPressable.spring
 *
 * Usage:  node scripts/gen-spring.mjs           # print
 *         node scripts/gen-spring.mjs --write   # patch into theme.css
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEME = path.join(ROOT, "packages/claralight/styles/theme.css");

/** Overshoot of an underdamped second-order system, as a fraction of travel. */
const overshootOf = (zeta) => Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));

/**
 * CLMotion.springOut — `omega` and the returned time are both in normalised
 * progress, mirroring Flutter's `Curve.transformInternal`.
 */
function overlaySpring({ omega = 9.2, zeta = 0.82 } = {}) {
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return {
    zeta,
    wn: omega,
    overshoot: overshootOf(zeta),
    /** @param {number} u normalised progress in [0,1] */
    p: (u) =>
      1 -
      Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + ((zeta * omega) / wd) * Math.sin(wd * u)),
    /** Duration the Flutter default route/appear transition would use. */
    durationMs: 450,
  };
}

/**
 * CLPressable.spring — mass 1, stiffness 520, damping 16. Real physics, so
 * time is in seconds and the emitted duration is a judgement call.
 */
function pressSpring({ mass = 1, stiffness = 520, damping = 16, durationMs = 550 } = {}) {
  const wn = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta >= 1) throw new Error(`spring is not underdamped (zeta=${zeta.toFixed(3)})`);
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  return {
    zeta,
    wn,
    overshoot: overshootOf(zeta),
    durationMs,
    /** @param {number} u normalised progress in [0,1] mapped onto durationMs */
    p: (u) => {
      const t = u * (durationMs / 1000);
      return (
        1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t))
      );
    },
  };
}

/**
 * Samples a spring into the CSS `linear()` stop syntax over u in [0,1].
 *
 * The final stop is pinned to 1 so the easing completes exactly. The
 * residual it hides is reported by the caller — for both ClaraLight springs
 * it is far below one display frame of the travelled distance.
 */
function toLinear(s, { hz = 120 } = {}) {
  const n = Math.max(8, Math.ceil((s.durationMs / 1000) * hz));
  const stops = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const v = i === 0 ? 0 : i === n ? 1 : Number(s.p(u).toFixed(4));
    stops.push(i === 0 || i === n ? String(v) : `${v} ${+(u * 100).toFixed(2)}%`);
  }
  return `linear(${stops.join(", ")})`;
}

/** Last u at which the curve is still further than `tol` from rest. */
function settleAt(s, tol) {
  const n = 40000;
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    if (Math.abs(s.p(u) - 1) > tol) return ((i + 1) / n) * (s.durationMs / 1000);
  }
  return 0;
}

/**
 * Smallest spring travel that makes a given residual visible, used to sanity
 * check that the pinned endpoint is imperceptible.
 */
function residualPx(s, pixels) {
  return (Math.abs(s.p(1) - 1) * pixels).toFixed(4);
}

const springs = {
  "--ease-cl-spring-overlay": {
    spring: overlaySpring(),
    label: "CLMotion.springOut",
  },
  "--ease-cl-spring-press": {
    spring: pressSpring(),
    label: "CLPressable.spring",
  },
};

const lines = [];
for (const [name, { spring, label }] of Object.entries(springs)) {
  lines.push(
    `${label}  [${name}]\n` +
      `  zeta=${spring.zeta.toFixed(4)}  omega_n=${spring.wn.toFixed(3)}\n` +
      `  overshoot=${(spring.overshoot * 100).toFixed(2)}% of travel\n` +
      `  settle |e|<1%   ${(settleAt(spring, 0.01) * 1000).toFixed(0)}ms\n` +
      `  settle |e|<0.1% ${(settleAt(spring, 0.001) * 1000).toFixed(0)}ms\n` +
      `  emitted ${spring.durationMs}ms; pinned endpoint hides ${(
        Math.abs(spring.p(1) - 1) * 100
      ).toFixed(3)}% of travel (= ${residualPx(spring, 200)}px on a 200px control)`,
  );
}
console.error(lines.join("\n\n"));

const tokens = Object.fromEntries(
  Object.entries(springs).map(([name, { spring }]) => [name, toLinear(spring)]),
);

if (process.argv.includes("--write")) {
  let css = readFileSync(THEME, "utf8");
  for (const [name, value] of Object.entries(tokens)) {
    const re = new RegExp(`(${name}:\\s*)([^;]+)(;)`);
    if (!re.test(css)) throw new Error(`token ${name} not found in ${THEME}`);
    css = css.replace(re, `$1${value}$3`);
  }
  writeFileSync(THEME, css);
  console.error(`\nwrote ${Object.keys(tokens).length} tokens to ${path.relative(ROOT, THEME)}`);
} else {
  for (const [name, value] of Object.entries(tokens)) console.log(`${name}: ${value};`);
}
