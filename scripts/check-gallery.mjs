#!/usr/bin/env node
/**
 * Visual contract test for the built gallery.
 *
 * The Vitest suite covers behaviour (focus traps, keyboard, typeahead) in a
 * real engine but imports no CSS, so it cannot see whether a token actually
 * reached the page. This script drives the built gallery in Chromium and reads
 * *computed* styles, which is the only place the full chain is exercised:
 * theme.css -> Tailwind's @theme -> utilities -> the class strings in dist.
 *
 * Deliberately not a screenshot diff: a pixel baseline would need maintaining
 * across font loading and GPU differences, while computed styles assert the
 * design contract directly and fail with a readable value.
 *
 * Usage:
 *   pnpm build && pnpm --filter @claralight/docs build
 *   pnpm --filter @claralight/docs preview --port 4173 &
 *   node scripts/check-gallery.mjs
 *
 * Env: CL_BROWSER (defaults to Edge on macOS, then Chrome, then Playwright's).
 */

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const URL_BASE = process.env.CL_GALLERY_URL ?? "http://localhost:4173";

const CANDIDATES = [
  process.env.CL_BROWSER,
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error(
    `No browser found. Set CL_BROWSER to a Chromium binary.\nTried:\n  ${CANDIDATES.join("\n  ")}`,
  );
  process.exit(2);
}

/* ---------------------------------------------------------------------------
 * Assertions
 * ------------------------------------------------------------------------- */

const failures = [];
let checks = 0;

function ok(label, condition, detail = "") {
  checks++;
  if (!condition) failures.push(label);
  console.log(`${condition ? "  ok  " : " FAIL "} ${label.padEnd(52)} ${detail}`);
}

function section(name) {
  console.log(`\n${name}`);
}

/**
 * Exact parser for the forms Chrome serialises `--cl-*` to.
 *
 * Deliberately NOT measured through canvas: a canvas round-trips translucent
 * colours through a premultiplied backing store, so `rgb(176 160 148 / .102)`
 * reads back as (177,157,147). That is measurement noise on the very value
 * being verified.
 */
function parseColor(raw) {
  if (!raw) return null;
  const str = raw.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(str);
  if (hex) {
    const h = hex[1];
    const exp = h.length <= 4 ? [...h].map((c) => c + c).join("") : h;
    return {
      r: Number.parseInt(exp.slice(0, 2), 16),
      g: Number.parseInt(exp.slice(2, 4), 16),
      b: Number.parseInt(exp.slice(4, 6), 16),
      a: exp.length === 8 ? Number.parseInt(exp.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(str);
  if (!fn) return null;
  const p = fn[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

const same = (a, b, tolCh = 1, tolA = 0.006) =>
  !!a &&
  !!b &&
  Math.abs(a.r - b.r) <= tolCh &&
  Math.abs(a.g - b.g) <= tolCh &&
  Math.abs(a.b - b.b) <= tolCh &&
  Math.abs(a.a - b.a) <= tolA;

const fmt = (c) =>
  c
    ? `rgba(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)},${Number(c.a.toFixed(3))})`
    : "unparsed";

/**
 * Recovers an element's real RGBA whatever syntax the computed value uses.
 *
 * Chrome serialises a `color-mix()` result as `oklab(...)` in
 * `getComputedStyle`, regardless of which space the author wrote, so string
 * parsing is not enough. Compositing the colour over white and over black and
 * solving the two equations gives the colour back exactly:
 *
 *   overWhite = a*C + (1-a)*255      overBlack = a*C
 *   a = 1 - (overWhite - overBlack)/255      C = overBlack / a
 */
async function measureRgba(page, handle) {
  return page.evaluate((e) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const bg = getComputedStyle(e).backgroundColor;
    const over = (base) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const w = over("#ffffff");
    const k = over("#000000");
    const a = 1 - (w[0] - k[0] + w[1] - k[1] + w[2] - k[2]) / (3 * 255);
    const c = a > 0.001 ? k.map((v) => v / a) : [0, 0, 0];
    return { r: c[0], g: c[1], b: c[2], a };
  }, handle);
}

/** Compares cubic-bezier curves numerically; Chrome strips leading zeros. */
function sameBezier(a, b) {
  const parse = (s) => {
    const m = /^cubic-bezier\((.+)\)$/.exec((s ?? "").trim());
    return m ? m[1].split(",").map((n) => Number.parseFloat(n)) : null;
  };
  const x = parse(a);
  const y = parse(b);
  return !!x && !!y && x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-6);
}

/** Dart `0xAARRGGBB` literal -> RGBA in 0..1. */
const fromDart = (lit) => {
  const n = Number.parseInt(lit.slice(2), 16);
  return {
    a: ((n >>> 24) & 0xff) / 255,
    r: (n >>> 16) & 0xff,
    g: (n >>> 8) & 0xff,
    b: n & 0xff,
  };
};

/**
 * Every token in theme.css, paired with the `CLColorScheme` field it must equal.
 * These are the Flutter literals, not values transcribed from our own CSS —
 * otherwise the test would only prove we can copy a number.
 */
const TOKENS = {
  background: { dark: "0xFF191919", light: "0xFFF9F6EE" },
  panel: { dark: "0xFF111111", light: "0xFFF4F2EA" },
  frost: { dark: "0xBF161616", light: "0x9CFFFFFF" },
  control: { dark: "0x1AFFFFFF", light: "0x1AB0A094" },
  "control-highlight": { dark: "0x26FFFFFF", light: "0x33B0A094" },
  floating: { dark: "0x9B000000", light: "0x9CFFFFFF" },
  "on-floating": { dark: "0xFFFFFFFF", light: "0xFF160A01" },
  selection: { dark: "0x29FFFFFF", light: "0x1AB0A094" },
  track: { dark: "0x1AFFFFFF", light: "0x1AB0A094" },
  separator: { dark: "0x1AFFFFFF", light: "0x1A160A01" },
  outline: { dark: "0x26FFFFFF", light: "0x29160A01" },
  "outline-strong": { dark: "0x4DFFFFFF", light: "0x4D160A01" },
  foreground: { dark: "0xFFFFFFFF", light: "0xFF160A01" },
  "foreground-secondary": { dark: "0xE5FFFFFF", light: "0xE6160A01" },
  "foreground-tertiary": { dark: "0xBFFFFFFF", light: "0xBF160A01" },
  "foreground-hint": { dark: "0x66FFFFFF", light: "0x9E160A01" },
  "foreground-disabled": { dark: "0x59FFFFFF", light: "0x52160A01" },
  accent: { dark: "0xFF0090FF", light: "0xFF0090FF" },
  "accent-background": { dark: "0x530088F6", light: "0x290090FF" },
  "on-accent": { dark: "0xFFFFFFFF", light: "0xFFFFFFFF" },
  success: { dark: "0xFF30D158", light: "0xFF34C759" },
  warning: { dark: "0xFFFFBA18", light: "0xFFC7871E" },
  danger: { dark: "0xFFE5484D", light: "0xFFE5484D" },
  "on-danger": { dark: "0xFFFFFFFF", light: "0xFFFFFFFF" },
  scrim: { dark: "0x73000000", light: "0x59000000" },
};

/** `Color.lerp(fill, white, 0.08)`, the button's hover lift. */
function lerped(fill, t) {
  return {
    r: fill.r + (255 - fill.r) * t,
    g: fill.g + (255 - fill.g) * t,
    b: fill.b + (255 - fill.b) * t,
  };
}

const maxCh = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

/**
 * Reads a shape and the wrapper Lisse mounts its overlays on.
 *
 * Assertions moved here from `border-radius` once `Squircle` landed, because
 * `border-radius` is now cleared to `0px` *on purpose* — it intersects
 * `clip-path`, so leaving it on the element squares the smooth corner back off.
 * The real contract is the generated path: the arc command carries the radius
 * and the path begins at `p = (1 + xi) * R` along each edge.
 */
async function readShape(selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const wrapper = el.parentElement;
    const svgs = [...(wrapper?.querySelectorAll(":scope > svg") ?? [])];
    return {
      token: el.dataset.clSquircle,
      state: el.getAttribute("data-state"),
      clip: cs.clipPath,
      borderRadius: cs.borderRadius,
      inlineRadius: el.style.borderRadius,
      borderWidth: cs.borderTopWidth,
      boxShadow: cs.boxShadow,
      bg: cs.backgroundColor,
      blur: cs.backdropFilter,
      wrapperPosition: wrapper ? getComputedStyle(wrapper).position : null,
      wrapperOutline: wrapper ? getComputedStyle(wrapper).outlineColor : null,
      wrapperTransition: wrapper ? getComputedStyle(wrapper).transitionProperty : null,
      wrapperClass: wrapper?.className ?? "",
      svgCount: svgs.length,
      strokes: svgs.flatMap((v) => [...v.querySelectorAll("path[stroke]")]).length,
      filters: svgs.flatMap((v) => [...v.querySelectorAll("filter")]).length,
    };
  }, selector);
}

/** `[start, arcRadius]` parsed out of a `clip-path: path("M ... A r r ...")`. */
function pathGeometry(clip) {
  const start = /path\("M ([\d.]+) ([\d.]+)/.exec(clip);
  const arc = / A ([\d.]+) ([\d.]+) /.exec(clip);
  return {
    startX: start ? Number(start[1]) : null,
    arcRadius: arc ? Number(arc[1]) : null,
  };
}

/** Figma's shoulder length: `p = (1 + xi) * R`, rounded for float noise. */
const shoulder = (r, xi = 0.6) => Number(((1 + xi) * r).toFixed(2));

/* ---------------------------------------------------------------------------
 * Run
 * ------------------------------------------------------------------------- */

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

const go = (id) => page.goto(`${URL_BASE}/#/${id}`, { waitUntil: "networkidle0" });
const clickText = async (text) => {
  const handle = await page.evaluateHandle(
    (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t),
    text,
  );
  const el = handle.asElement();
  if (!el) throw new Error(`no button labelled "${text}"`);
  await el.click();
};
const readTokens = () =>
  page.evaluate((names) => {
    const cs = getComputedStyle(document.documentElement);
    return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(`--cl-${n}`).trim()]));
  }, Object.keys(TOKENS));
const toggleScheme = async () => {
  const h = await page.evaluateHandle(() => document.querySelector("button[aria-label]"));
  await h.asElement().click();
  await new Promise((r) => setTimeout(r, 250));
};

try {
  /*
   * Every page first, because a component that throws during render takes its
   * whole page down and the symptom is a missing selector several sections
   * later. `SelectLabel` placed outside `Select` did exactly that: it reads the
   * root's context, so the page rendered nothing and the failure surfaced as
   * "no [data-slot=select-trigger]" rather than as the actual cause.
   */
  section("[Gallery · every page renders]");
  const pages = ["button", "input", "card", "dialog", "select", "shape", "tokens"];
  for (const id of pages) {
    consoleErrors.length = 0;
    await go(id);
    await new Promise((r) => setTimeout(r, 300));
    const rendered = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        text: (main?.textContent ?? "").trim().length,
        headings: main?.querySelectorAll("h1,h2").length ?? 0,
      };
    });
    ok(
      `#/${id} renders with content and no errors`,
      consoleErrors.length === 0 && rendered.text > 60 && rendered.headings > 0,
      `${rendered.text} chars, ${rendered.headings} headings${consoleErrors.length ? `, ERRORS: ${consoleErrors[0]}` : ""}`,
    );
  }

  // ---- Tokens: byte-exact against the Dart literals ---------------------
  for (const scheme of ["dark", "light"]) {
    section(`[Tokens · ${scheme} · every --cl-* equals its CLColorScheme literal]`);
    await go("tokens");
    if (scheme === "light") await toggleScheme();
    const css = await readTokens();
    let exact = 0;
    for (const [name, want] of Object.entries(TOKENS)) {
      const got = parseColor(css[name]);
      if (same(got, fromDart(want[scheme]))) exact++;
      else
        console.log(
          `        MISMATCH --cl-${name}: got ${fmt(got)} want ${fmt(fromDart(want[scheme]))}`,
        );
    }
    ok(
      `all ${Object.keys(TOKENS).length} tokens exact`,
      exact === Object.keys(TOKENS).length,
      `${exact}/${Object.keys(TOKENS).length}`,
    );
    if (scheme === "light") await toggleScheme();
  }

  // ---- Type ramp, shape and motion tokens ------------------------------
  section("[Tokens · ramp, shape, motion]");
  await go("tokens");
  const scale = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const g = (k) => cs.getPropertyValue(k).trim();
    return {
      title: g("--text-title"),
      titleLh: g("--text-title--line-height"),
      titleW: g("--text-title--font-weight"),
      display: g("--text-display"),
      label: g("--text-label"),
      rControl: g("--radius-control"),
      rCapsule: g("--radius-capsule"),
      rDialog: g("--radius-dialog"),
      eOut: g("--ease-cl-out"),
      eDrawer: g("--ease-cl-drawer"),
      springOverlay: g("--ease-cl-spring-overlay"),
      springPress: g("--ease-cl-spring-press"),
      blur: g("--blur-frost"),
      bodySize: getComputedStyle(document.body).fontSize,
    };
  });
  ok(
    "title step is 16px / 1.3125 / 600",
    scale.title === "16px" && scale.titleLh === "1.3125" && scale.titleW === "600",
    `${scale.title} ${scale.titleLh} w${scale.titleW}`,
  );
  ok("display step is 30px", scale.display === "30px", scale.display);
  ok(
    "radii: control 8 / capsule 999 / dialog 36",
    scale.rControl === "8px" && scale.rCapsule === "999px" && scale.rDialog === "36px",
    `${scale.rControl} ${scale.rCapsule} ${scale.rDialog}`,
  );
  ok(
    "CLMotion.easeOut = cubic-bezier(.23,1,.32,1)",
    sameBezier(scale.eOut, "cubic-bezier(0.23, 1, 0.32, 1)"),
    scale.eOut,
  );
  ok(
    "CLMotion.drawer = cubic-bezier(.32,.72,0,1)",
    sameBezier(scale.eDrawer, "cubic-bezier(0.32, 0.72, 0, 1)"),
    scale.eDrawer,
  );
  ok(
    "both springs are sampled into linear()",
    scale.springOverlay.startsWith("linear(0,") && scale.springPress.startsWith("linear(0,"),
    `${(scale.springOverlay.match(/,/g) ?? []).length + 1} / ${(scale.springPress.match(/,/g) ?? []).length + 1} stops`,
  );
  ok("frost blur = 36px (Flutter frostSigma)", scale.blur === "36px", scale.blur);
  ok("body renders at the body step (15px)", scale.bodySize === "15px", scale.bodySize);

  // ---- Button ---------------------------------------------------------
  section("[Button · capsule, press spring, per-variant disabled]");
  await go("button");
  await new Promise((r) => setTimeout(r, 500));

  const btn = await page.evaluate(() => {
    const pick = (l, d) =>
      [...document.querySelectorAll("button")].find(
        (x) => x.textContent.trim() === l && x.disabled === d,
      );
    const read = (x) =>
      x ? { bg: getComputedStyle(x).backgroundColor, color: getComputedStyle(x).color } : null;
    const sizes = [...document.querySelectorAll("button")]
      .filter((x) => /^(Small|Medium|Large)$/.test(x.textContent.trim()))
      .map((x) => [x.textContent.trim(), getComputedStyle(x).height]);
    const on = pick("Upload", false);
    return {
      sizes,
      fontSize: getComputedStyle(on).fontSize,
      fontWeight: getComputedStyle(on).fontWeight,
      press: getComputedStyle(on).getPropertyValue("--cl-press-scale").trim(),
      // The transition lives on the wrapper now, so the spring leg must be there.
      wrapperTransition: getComputedStyle(on.parentElement).transitionProperty,
      wrapperClass: on.parentElement.className,
      primaryOff: read(pick("Upload", true)),
      secondaryOff: read(pick("Cancel", true)),
      ghostOff: read(pick("Details", true)),
      dangerOff: read(pick("Delete", true)),
      dangerOn: read(pick("Delete", false)),
    };
  });

  const btnShape = await readShape("button[data-cl-squircle]");
  const btnGeom = pathGeometry(btnShape.clip);

  ok(
    "heights are CLControlSize 28/36/44",
    JSON.stringify(btn.sizes) === '[["Small","28px"],["Medium","36px"],["Large","44px"]]',
    JSON.stringify(btn.sizes),
  );
  ok(
    "lg label = title re-weighted to 500 at 17px",
    btn.fontSize === "17px" && btn.fontWeight === "500",
    `${btn.fontSize} w${btn.fontWeight}`,
  );
  ok("press scale = 1 + 4/height/2 = 1.0455", btn.press === "1.0455", btn.press);
  ok(
    "press transition is on the wrapper",
    btn.wrapperTransition.includes("transform"),
    btn.wrapperTransition,
  );
  ok(
    "wrapper carries cl-press (so fill, border and shadow scale together)",
    btn.wrapperClass.includes("cl-press"),
    btn.wrapperClass,
  );
  ok(
    "wrapper carries the focus ring class",
    btn.wrapperClass.includes("cl-squircle-root"),
    btn.wrapperClass,
  );

  /*
   * The capsule is radius 999 clamped to half the height, so a 44px button has
   * a 22px corner. That the arc command says `A 22 22` — rather than the token's
   * 999 — is what proves the clamp happened, and `p = (1 + xi) * 22 = 35.2` is
   * what proves the Figma construction is the one being drawn.
   */
  ok(
    "capsule radius clamped to height/2",
    btnGeom.arcRadius === 22,
    `A ${btnGeom.arcRadius} ${btnGeom.arcRadius}`,
  );
  ok("shoulder = (1 + xi) * 22 = 35.2", btnGeom.startX === shoulder(22), `M ${btnGeom.startX} 0`);
  ok(
    "border-radius cleared so it cannot square the clip",
    btnShape.borderRadius === "0px",
    btnShape.borderRadius,
  );
  ok(
    "fill came from the extracted border, not CSS",
    btnShape.borderWidth === "0px",
    btnShape.borderWidth,
  );

  ok(
    "secondary fill = ColorScheme.floating",
    same(parseColor(btn.secondaryOff.bg), { r: 0, g: 0, b: 0, a: 0.608 }),
    btn.secondaryOff.bg,
  );
  ok(
    "danger enabled = #e5484d",
    same(parseColor(btn.dangerOn.bg), { r: 229, g: 72, b: 77, a: 1 }),
    btn.dangerOn.bg,
  );
  ok(
    "disabled: primary keeps accent fill",
    same(parseColor(btn.primaryOff.bg), { r: 0, g: 144, b: 255, a: 1 }),
    btn.primaryOff.bg,
  );
  ok(
    "disabled: text -> textDisabled",
    same(parseColor(btn.primaryOff.color), { r: 255, g: 255, b: 255, a: 0.349 }),
    btn.primaryOff.color,
  );
  ok(
    "disabled: danger drops its colour",
    same(parseColor(btn.dangerOff.bg), { r: 255, g: 255, b: 255, a: 0.102 }),
    btn.dangerOff.bg,
  );
  ok(
    "disabled: ghost has no fill",
    same(parseColor(btn.ghostOff.bg), { r: 0, g: 0, b: 0, a: 0 }),
    btn.ghostOff.bg,
  );

  section("[Button · hover lift]");
  const hover = async (label, baseRaw) => {
    const el = await page.evaluateHandle(
      (n) =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === n && !b.disabled,
        ),
      label,
    );
    const base = parseColor(baseRaw);
    await el.hover();
    await new Promise((r) => setTimeout(r, 300));
    return { base, after: await measureRgba(page, el) };
  };
  const danger = await hover("Delete", btn.dangerOn.bg);
  const wantDanger = lerped(danger.base, 0.08);
  ok(
    "Delete: ~8% lift toward white",
    maxCh(danger.after, wantDanger) <= 6 && Math.abs(danger.after.a - danger.base.a) < 0.02,
    `${fmt(danger.base)} -> ${fmt(danger.after)}  want ~rgb(${wantDanger.r.toFixed(0)},${wantDanger.g.toFixed(0)},${wantDanger.b.toFixed(0)})  maxD ${maxCh(danger.after, wantDanger).toFixed(1)}`,
  );
  /*
   * The translucent fill is where `color-mix` and Flutter's `Color.lerp` part
   * ways: color-mix interpolates premultiplied, which is how alpha compositing
   * actually works, while Color.lerp interpolates straight channels and so lifts
   * a 60%-alpha fill roughly twice as far. That result is unreachable by any
   * compositing operation, so the assertion is on the implemented semantics.
   */
  const cancel = await hover("Cancel", btn.secondaryOff.bg);
  ok(
    "Cancel: alpha follows premultiplied mixing",
    Math.abs(cancel.after.a - (0.92 * cancel.base.a + 0.08)) < 0.005,
    `${cancel.base.a.toFixed(4)} -> ${cancel.after.a.toFixed(4)}`,
  );
  ok(
    "Cancel: fill lightens (Flutter would lighten ~2x more)",
    cancel.after.r > cancel.base.r,
    `${fmt(cancel.base)} -> ${fmt(cancel.after)}`,
  );

  // ---- Input ----------------------------------------------------------
  section("[Input · translucent overlay, focus ring on the wrapper]");
  await go("input");
  await new Promise((r) => setTimeout(r, 500));
  const fields = await page.evaluate(() =>
    [...document.querySelectorAll("input")].map((i) => {
      const cs = getComputedStyle(i);
      return {
        h: cs.height,
        bg: cs.backgroundColor,
        border: cs.borderTopColor,
        radius: cs.borderRadius,
      };
    }),
  );
  const fieldShape = await readShape("input[data-cl-squircle]");
  const fieldGeom = pathGeometry(fieldShape.clip);

  ok(
    "heights cover 28/36/44",
    new Set(fields.map((f) => f.h)).size === 3,
    fields.map((f) => f.h).join(","),
  );
  ok(
    "fill is translucent control, not opaque",
    same(parseColor(fields[0].bg), { r: 255, g: 255, b: 255, a: 0.102 }),
    fields[0].bg,
  );
  /*
   * `autoEffects` reads the CSS border and re-renders it as an SVG stroke, then
   * strips the CSS so the clipped original cannot show through. So the border is
   * asserted where it now lives, not on `border-top-color`.
   */
  const fieldStroke = await page.evaluate(() => {
    const svg = document
      .querySelector("input[data-cl-squircle]")
      ?.parentElement?.querySelector(":scope > svg");
    /*
     * Not just `path[stroke]`: Lisse's double-border masks also carry
     * `stroke="black"`, and they come first in document order. The painted
     * border is the one with a stroke-width.
     */
    const path = svg?.querySelector("path[stroke][stroke-width]");
    return path
      ? { color: path.getAttribute("stroke"), opacity: Number(path.getAttribute("stroke-opacity")) }
      : null;
  });
  ok(
    "border re-rendered as an SVG stroke at ColorScheme.outline",
    fieldStroke?.color === "#ffffff" && Math.abs(fieldStroke.opacity - 0.149) < 0.01,
    `${fieldStroke?.color} @ ${fieldStroke?.opacity}`,
  );
  ok(
    "radii.control became the arc radius",
    fieldGeom.arcRadius === 8,
    `A ${fieldGeom.arcRadius} ${fieldGeom.arcRadius}`,
  );
  ok("shoulder = (1 + xi) * 8 = 12.8", fieldGeom.startX === shoulder(8), `M ${fieldGeom.startX} 0`);
  ok(
    "stale rounded-* class removed (would square the clip)",
    fieldShape.borderRadius === "0px",
    fieldShape.borderRadius,
  );
  /*
   * The ring cannot live on the shape — `clip-path` crops `outline` to nothing
   * (measured: 436 lit pixels to 0). So it rides on the wrapper, driven by
   * `:has(> [data-cl-squircle]:focus)`. Focusing for real is what proves the
   * `:has()` link works rather than just that a class was applied.
   */
  const fieldBefore = await readShape("input[data-cl-squircle]");
  await page.evaluate(() => document.querySelector("input[data-cl-squircle]").focus());
  /*
   * `.cl-press` transitions `outline-color` over 140ms, so an immediate read
   * catches the ring mid-fade. That the fade exists is the point; the assertion
   * waits for it to land.
   */
  await new Promise((r) => setTimeout(r, 250));
  const fieldRing = await page.evaluate(() => {
    const wrapper = document.querySelector("input[data-cl-squircle]").parentElement;
    const cs = getComputedStyle(wrapper);
    return {
      isFocused: document.activeElement?.dataset.clSquircle === "control",
      color: cs.outlineColor,
      width: cs.outlineWidth,
      offset: cs.outlineOffset,
    };
  });
  ok("field takes focus", fieldRing.isFocused);
  ok(
    "ring is transparent until focused",
    fieldBefore.wrapperOutline === "rgba(0, 0, 0, 0)",
    fieldBefore.wrapperOutline,
  );
  ok(
    "focus ring on the wrapper lights up",
    same(parseColor(fieldRing.color), { r: 0, g: 144, b: 255, a: 1 }),
    fieldRing.color,
  );
  ok(
    "ring keeps its 2px width and 2px offset",
    fieldRing.width === "2px" && fieldRing.offset === "2px",
    `${fieldRing.width} / ${fieldRing.offset}`,
  );

  // ---- Card: the smooth-corner pipeline --------------------------------
  section("[Card · surface stack + Lisse smooth corners]");
  await go("card");
  await new Promise((r) => setTimeout(r, 500));
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-cl-slot="card"]')].map((el) => {
      const wrapper = el.parentElement;
      const svgs = [...(wrapper?.querySelectorAll(":scope > svg") ?? [])];
      const cs = getComputedStyle(el);
      return {
        token: el.dataset.clSquircle,
        state: el.getAttribute("data-state"),
        clip: cs.clipPath,
        borderRadius: cs.borderRadius,
        inlineRadius: el.style.borderRadius,
        borderWidth: cs.borderTopWidth,
        boxShadow: cs.boxShadow,
        bg: cs.backgroundColor,
        blur: cs.backdropFilter,
        wrapperPosition: wrapper ? getComputedStyle(wrapper).position : null,
        svgCount: svgs.length,
        strokes: svgs.flatMap((v) => [...v.querySelectorAll("path[stroke]")]).length,
        filters: svgs.flatMap((v) => [...v.querySelectorAll("filter")]).length,
      };
    }),
  );

  const card = cards.find((c) => c.token === "medium");
  ok("three cards are shaped", cards.length === 3, `${cards.length} found`);
  ok(
    "every card reached data-state=ready",
    cards.every((c) => c.state === "ready"),
    cards.map((c) => c.state).join(","),
  );
  ok(
    "radius token read from --radius-*",
    cards.every((c) => c.token === "medium"),
    cards.map((c) => c.token).join(","),
  );
  ok(
    "clip-path is an SVG path, not CSS corner-shape",
    card.clip.startsWith('path("M '),
    card.clip.slice(0, 40),
  );
  ok(
    "shoulder = (1 + xi) * 12 = 19.2",
    pathGeometry(card.clip).startX === shoulder(12),
    `M ${pathGeometry(card.clip).startX} 0`,
  );
  ok(
    "circular arc carries the radius",
    pathGeometry(card.clip).arcRadius === 12,
    `A ${pathGeometry(card.clip).arcRadius} ${pathGeometry(card.clip).arcRadius}`,
  );
  ok(
    "border-radius cleared once the path landed",
    card.borderRadius === "0px" && card.inlineRadius === "",
    `${card.borderRadius} / "${card.inlineRadius}"`,
  );
  ok("fill survives the clip", same(parseColor(card.bg), { r: 17, g: 17, b: 17, a: 1 }), card.bg);
  ok(
    "CSS border stripped (would be clipped to nothing)",
    card.borderWidth === "0px",
    card.borderWidth,
  );
  ok("CSS box-shadow stripped", card.boxShadow === "none", card.boxShadow);
  ok("overlay anchor is positioned", card.wrapperPosition === "relative", card.wrapperPosition);
  ok(
    "two overlays mounted (effects z:1, drop shadow z:-1)",
    card.svgCount === 2,
    String(card.svgCount),
  );
  ok("extracted border became SVG strokes", card.strokes > 0, `${card.strokes} stroked paths`);
  ok("extracted shadow became SVG filters", card.filters > 0, `${card.filters} filters`);
  const frostCard = cards.find((c) => c.blur === "blur(36px)");
  ok("frost variant keeps its backdrop blur", !!frostCard, frostCard?.blur ?? "none");

  // ---- Dialog ---------------------------------------------------------
  section("[Dialog · surface, geometry, focus]");
  await go("dialog");
  await new Promise((r) => setTimeout(r, 300));
  await clickText("Open dialog");
  await new Promise((r) => setTimeout(r, 600));

  const dlg = await page.evaluate(() => {
    const p = document.querySelector('[data-cl-slot="dialog-popup"]');
    if (!p) return null;
    const wrapper = p.parentElement;
    const wcs = getComputedStyle(wrapper);
    const r = wrapper.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return {
      role: p.getAttribute("role"),
      blur: cs.backdropFilter,
      bg: cs.backgroundColor,
      clip: cs.clipPath,
      // Positioning and the entrance belong to the wrapper, because the SVG
      // overlays are its siblings and would otherwise not move with the shape.
      wrapperPosition: wcs.position,
      wrapperTranslate: wcs.translate,
      wrapperTransition: wcs.transitionProperty,
      wrapperClass: wrapper.className,
      scrim: getComputedStyle(document.querySelector('[data-cl-slot="dialog-backdrop"]'))
        .backgroundColor,
      centeredX: Math.abs(r.x + r.width / 2 - innerWidth / 2) < 1.5,
      centeredY: Math.abs(r.y + r.height / 2 - innerHeight / 2) < 1.5,
    };
  });

  ok("opens with role=dialog", dlg?.role === "dialog", dlg?.role);
  ok("frost blur = 36px", dlg?.blur === "blur(36px)", dlg?.blur);
  ok(
    "fill = ColorScheme.frost",
    same(parseColor(dlg?.bg), { r: 22, g: 22, b: 22, a: 0.749 }, 1, 0.008),
    dlg?.bg,
  );
  ok(
    "scrim = ColorScheme.scrim",
    same(parseColor(dlg?.scrim), { r: 0, g: 0, b: 0, a: 0.451 }),
    dlg?.scrim,
  );
  ok(
    "radii.dialog becomes the arc radius",
    pathGeometry(dlg?.clip ?? "").arcRadius === 36,
    `A ${pathGeometry(dlg?.clip ?? "").arcRadius}`,
  );
  ok(
    "shoulder = (1 + xi) * 36 = 57.6",
    pathGeometry(dlg?.clip ?? "").startX === shoulder(36),
    `M ${pathGeometry(dlg?.clip ?? "").startX} 0`,
  );
  ok("wrapper is what is fixed-positioned", dlg?.wrapperPosition === "fixed", dlg?.wrapperPosition);
  ok(
    "wrapper is what is centred",
    dlg?.wrapperTranslate === "-50% -50%" && dlg?.centeredX && dlg?.centeredY,
    dlg?.wrapperTranslate,
  );
  ok(
    "wrapper owns the entrance transition",
    (dlg?.wrapperTransition ?? "").includes("scale"),
    dlg?.wrapperTransition,
  );
  ok(
    "wrapper mirrors Base UI's transition state via :has()",
    dlg?.wrapperClass.includes("cl-enter-root"),
    dlg?.wrapperClass,
  );

  const trapped = [];
  for (let i = 0; i < 8; i++) {
    trapped.push(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-cl-slot="dialog-popup"]')
            ?.contains(document.activeElement) ?? false,
      ),
    );
    await page.keyboard.press("Tab");
    await new Promise((r) => setTimeout(r, 60));
  }
  ok("focus trapped through 8 tabs", trapped.every(Boolean), trapped.join(","));
  await page.keyboard.press("Escape");
  await new Promise((r) => setTimeout(r, 600));
  ok("Escape closes and fully unmounts", (await page.$('[data-cl-slot="dialog-popup"]')) === null);

  // ---- Select ---------------------------------------------------------
  section("[Select · popup, keyboard]");
  await go("select");
  await new Promise((r) => setTimeout(r, 400));
  ok(
    "trigger resolves the label from `items`",
    (await page.$eval('[data-cl-slot="select-trigger"]', (e) => e.textContent.trim())).startsWith(
      "Sans-serif",
    ),
  );
  const triggerShape = await readShape('[data-cl-slot="select-trigger"]');
  ok(
    "trigger is shaped at radii.control",
    pathGeometry(triggerShape.clip).arcRadius === 8,
    `A ${pathGeometry(triggerShape.clip).arcRadius}`,
  );
  await page.evaluate(() => document.querySelector('[data-cl-slot="select-trigger"]').focus());
  await new Promise((r) => setTimeout(r, 250));
  const triggerRing = await page.evaluate(() => {
    const t = document.querySelector('[data-cl-slot="select-trigger"]');
    return {
      focused: document.activeElement === t,
      color: getComputedStyle(t.parentElement).outlineColor,
    };
  });
  ok(
    "trigger focus ring on the wrapper lights up",
    triggerRing.focused && same(parseColor(triggerRing.color), { r: 0, g: 144, b: 255, a: 1 }),
    triggerRing.color,
  );

  await (await page.$('[data-cl-slot="select-trigger"]')).click();
  await new Promise((r) => setTimeout(r, 400));
  const sel = await page.evaluate(() => {
    const popup = document.querySelector('[data-cl-slot="select-content"]');
    const wrapper = popup.parentElement;
    const positioner = wrapper.parentElement;
    const cfg = getComputedStyle(positioner);
    return {
      blur: getComputedStyle(popup).backdropFilter,
      clip: getComputedStyle(popup).clipPath,
      itemRadius: getComputedStyle(document.querySelector('[data-cl-slot="select-item"]'))
        .borderRadius,
      wrapperOrigin: getComputedStyle(wrapper).transformOrigin,
      wrapperClass: wrapper.className,
      origin: cfg.getPropertyValue("--transform-origin").trim(),
      anchorW: cfg.getPropertyValue("--anchor-width").trim(),
      availableH: cfg.getPropertyValue("--available-height").trim(),
    };
  });
  ok("popup is frosted", sel.blur === "blur(36px)", sel.blur);
  ok(
    "radii.medium becomes the arc radius",
    pathGeometry(sel.clip).arcRadius === 12,
    `A ${pathGeometry(sel.clip).arcRadius}`,
  );
  ok("item radius = radii.control - 2", sel.itemRadius === "6px", sel.itemRadius);
  ok("Base UI computed --transform-origin", sel.origin.length > 0, sel.origin);
  // `0%` serialises as `0px` when resolved, so compare the numbers not the string.
  const originPx = (v) => v.split(/\s+/).map((n) => Number.parseFloat(n));
  const [ox, oy] = originPx(sel.wrapperOrigin);
  const [ex, ey] = originPx(sel.origin);
  ok(
    "popup grows from the trigger (origin inherited onto the wrapper)",
    Math.abs(ox - ex) < 0.5 && Math.abs(oy - ey) < 0.5,
    `${sel.wrapperOrigin} vs ${sel.origin}`,
  );
  ok("wrapper owns the entrance", sel.wrapperClass.includes("cl-enter-root"), sel.wrapperClass);
  ok(
    "Base UI measured --anchor-width / --available-height",
    sel.anchorW.length > 0 && sel.availableH.length > 0,
    `${sel.anchorW} / ${sel.availableH}`,
  );
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await new Promise((r) => setTimeout(r, 400));
  ok(
    "ArrowDown + Enter selects the next item",
    (await page.$eval('[data-cl-slot="select-trigger"]', (e) => e.textContent.trim())).startsWith(
      "Serif",
    ),
  );

  section("[Corner shape gallery]");
  await go("shape");
  await new Promise((r) => setTimeout(r, 400));
  const shaped = await page.evaluate(() =>
    [...document.querySelectorAll("[data-cl-squircle], [data-state]")]
      .filter((e) => e.getAttribute("data-state"))
      .map((e) => e.getAttribute("data-state")),
  );
  ok(
    "smoothing ladder all ready",
    shaped.length >= 8 && shaped.every((v) => v === "ready"),
    `${shaped.length} samples`,
  );

  section("[Gallery]");
  ok("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} catch (err) {
  failures.push(`threw: ${err.message}`);
  console.error(`\nFAIL — ${err.message}`);
} finally {
  await browser.close();
}

console.log(
  `\n${failures.length === 0 ? `ALL ${checks} CHECKS PASS` : `${failures.length} of ${checks} FAILED:\n  - ${failures.join("\n  - ")}`}`,
);
process.exit(failures.length ? 1 : 0);
