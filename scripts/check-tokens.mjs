/**
 * Verifies that every `--cl-*` token in theme.css still matches the ClaraLight
 * Flutter source of truth, byte for byte.
 *
 * The port is 54 hand-converted 0xRRGGBBAA literals, which is exactly the kind
 * of work where one digit goes wrong silently — an E5/E6 confusion or a 0.002
 * alpha slip is invisible on screen. This script diffs the CSS against
 * `CLColorScheme.dark()` / `.light()` in colors.dart so a wrong digit fails
 * loudly instead of shipping.
 *
 * Usage: node scripts/check-tokens.mjs
 *        CL_FLUTTER_DIR=/path/to/ClaralightDesign-Flutter node scripts/check-tokens.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLUTTER =
  process.env.CL_FLUTTER_DIR ??
  path.join(process.env.HOME ?? "", "develop/flutter/ClaralightDesign-Flutter");
const DART = path.join(FLUTTER, "packages/claralight_ui/lib/src/theme/colors.dart");
const CSS = path.join(ROOT, "packages/claralight/styles/theme.css");

const dart = readFileSync(DART, "utf8");
const css = readFileSync(CSS, "utf8");

// Which Dart field each CSS token came from.
const MAP = {
  background: "background",
  panel: "panel",
  frost: "frost",
  control: "control",
  "control-highlight": "controlHighlight",
  floating: "floatingControl",
  "on-floating": "onFloatingControl",
  selection: "selection",
  track: "track",
  separator: "separator",
  outline: "outline",
  "outline-strong": "outlineStrong",
  foreground: "textPrimary",
  "foreground-secondary": "textSecondary",
  "foreground-tertiary": "textTertiary",
  "foreground-hint": "textHint",
  "foreground-disabled": "textDisabled",
  accent: "accent",
  "accent-background": "accentBackground",
  "on-accent": "onAccent",
  "selection-accent": "selectionAccent",
  success: "success",
  warning: "warning",
  "warning-background": "warningBackground",
  danger: "danger",
  "danger-background": "dangerBackground",
  "on-danger": "onDanger",
  scrim: "scrim",
};

/**
 * Defaults declared on the main constructor (`this.selectionAccent = ...`).
 * These are shared by both schemes and never appear in a scheme body, so they
 * have to be collected separately or they silently go unverified.
 */
function constructorDefaults() {
  const start = dart.indexOf("const CLColorScheme({");
  return dartValues(dart.slice(start, dart.indexOf("\n  });", start)));
}

/** Pull the `CLColorScheme.dark()` / `.light()` constructor bodies. */
function schemeBody(name) {
  const marker = `CLColorScheme.${name}()`;
  const start = dart.indexOf(marker);
  if (start < 0) throw new Error(`no CLColorScheme.${name}`);
  // Body runs to the first `);` after the marker.
  return dart.slice(start, dart.indexOf(");", start));
}
/** field -> {a,r,g,b}, or a raw literal. Handles both declarative fields
 * (`field: const Color(0x...)`) and constructor defaults
 * (`this.field = const Color(0x...)`). */
function dartValues(body) {
  const out = {};
  for (const m of body.matchAll(/(\w+)\s*[:=]\s*const Color\(0x([0-9A-Fa-f]{8})\)/g)) {
    const [, field, hex] = m;
    const n = Number.parseInt(hex, 16);
    out[field] = {
      a: ((n >>> 24) & 0xff) / 255,
      r: (n >>> 16) & 0xff,
      g: (n >>> 8) & 0xff,
      b: n & 0xff,
    };
  }
  return out;
}
/** token -> {a,r,g,b} parsed from our CSS, in the given scheme block */
function cssValues(scheme) {
  // The light block starts at `.light {`; dark at `:root,\n.dark {`.
  const start = scheme === "dark" ? css.indexOf(":root,\n.dark {") : css.indexOf(".light {");
  const body = css.slice(start, css.indexOf("\n}", start));
  const out = {};
  for (const m of body.matchAll(/--cl-([a-z-]+):\s*([^;]+);/g)) {
    const [, name, raw] = m;
    const v = raw.trim();
    let parsed = null;
    const hex = /^#([0-9a-f]{6})$/i.exec(v);
    if (hex) {
      const n = Number.parseInt(hex[1], 16);
      parsed = { a: 1, r: (n >>> 16) & 0xff, g: (n >>> 8) & 0xff, b: n & 0xff };
    }
    const rgbfn = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/.exec(v);
    if (rgbfn)
      parsed = {
        a: Number.parseFloat(rgbfn[4]),
        r: +rgbfn[1],
        g: +rgbfn[2],
        b: +rgbfn[3],
      };
    out[name] = parsed ?? { raw: v };
  }
  return out;
}

const DEFAULTS = constructorDefaults();

let bad = 0,
  checked = 0;
for (const scheme of ["dark", "light"]) {
  const want = { ...DEFAULTS, ...dartValues(schemeBody(scheme)) };
  const got = cssValues(scheme);
  console.log(`\n=== ${scheme} ===`);
  for (const [token, field] of Object.entries(MAP)) {
    const w = want[field],
      g = got[token];
    if (!w) {
      console.log(`  ??  ${token}: CLColorScheme.${scheme}() has no ${field}`);
      continue;
    }
    checked++;
    if (!g || g.raw !== undefined) {
      console.log(`  ??  --cl-${token}: unparsed (${g?.raw})`);
      bad++;
      continue;
    }
    const da = Math.abs(g.a - w.a),
      maxCh = Math.max(Math.abs(g.r - w.r), Math.abs(g.g - w.g), Math.abs(g.b - w.b));
    const exact = da < 0.0006 && maxCh < 0.5;
    if (!exact) {
      bad++;
      console.log(
        `  MISMATCH --cl-${token.padEnd(22)} css a=${g.a.toFixed(4)} rgb(${g.r},${g.g},${g.b})  dart a=${w.a.toFixed(4)} rgb(${w.r},${w.g},${w.b})  -> ${field}`,
      );
      if (da >= 0.0006) {
        const byte = Math.round(w.a * 255)
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
        console.log(
          `             alpha should be ${byte}/255 = ${(Math.round(w.a * 255) / 255).toFixed(4)} (css has ${g.a})`,
        );
      }
    }
  }
}
console.log(`\n${bad === 0 ? `ALL ${checked} TOKENS EXACT` : `${bad} of ${checked} MISMATCHED`}`);
process.exit(bad ? 1 : 0);
