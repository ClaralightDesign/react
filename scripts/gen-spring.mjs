#!/usr/bin/env node
/**
 * Generates CSS `linear()` easing functions from the ClaraLight springs.
 *
 * All physical parameters are read from theme.css, the only hand-authored
 * design source. Overlay time is normalized progress; press time is seconds
 * mapped through the release-duration token. The overlay sampling duration
 * controls sample density, independently of the actual entrance duration.
 *
 * Both are emitted as `p(u)` over u in [0,1], using the closed-form solution
 * of an underdamped second-order system.
 *
 * Usage:  node scripts/gen-spring.mjs           # print
 *         node scripts/gen-spring.mjs --write   # patch into theme.css
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTokens, resolveToken } from "./lib/tokens.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const THEME = path.join(ROOT, "packages/claralight/styles/theme.css");

/** Overshoot of an underdamped second-order system, as a fraction of travel. */
const overshootOf = (zeta) => Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta * zeta));

/**
 * Overlay `omega` and time are both in normalized progress.
 */
function overlaySpring({ omega, zeta, durationMs }) {
  if (zeta >= 1) throw new Error("overlay spring must be underdamped");
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return {
    zeta,
    wn: omega,
    overshoot: overshootOf(zeta),
    /** @param {number} u normalised progress in [0,1] */
    p: (u) =>
      1 -
      Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + ((zeta * omega) / wd) * Math.sin(wd * u)),
    durationMs,
  };
}

/**
 * Press time is seconds; the release-duration token determines the endpoint.
 */
function pressSpring({ mass, stiffness, damping, durationMs }) {
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

function readSpringParameters(theme) {
  const number = (name, unit = "") => {
    const value = resolveToken(theme, name);
    const match = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}$`).exec(value);
    if (!match || !(Number(match[1]) > 0))
      throw new Error(`Invalid spring token ${name}: ${value}`);
    return Number(match[1]);
  };
  return {
    "--ease-cl-spring-overlay": {
      spring: overlaySpring({
        omega: number("--cl-spring-overlay-omega"),
        zeta: number("--cl-spring-overlay-zeta"),
        durationMs: number("--cl-spring-overlay-sample-duration", "ms"),
      }),
      label: "overlay",
    },
    "--ease-cl-spring-press": {
      spring: pressSpring({
        mass: number("--cl-spring-press-mass"),
        stiffness: number("--cl-spring-press-stiffness"),
        damping: number("--cl-spring-press-damping"),
        durationMs: number("--cl-duration-release", "ms"),
      }),
      label: "press",
    },
  };
}

export function generateSpringTokens(theme = readTokens()) {
  return Object.fromEntries(
    Object.entries(readSpringParameters(theme)).map(([name, { spring }]) => [
      name,
      toLinear(spring),
    ]),
  );
}

function main() {
  const theme = readTokens();
  const springs = readSpringParameters(theme);

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

  const tokens = generateSpringTokens(theme);

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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
