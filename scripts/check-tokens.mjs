/** Local token contract. No external repository, network or duplicate value table.
 * Usage: node scripts/check-tokens.mjs
 * Negative fixtures: node --test scripts/check-tokens.test.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { generateSpringTokens } from "./gen-spring.mjs";
import { parseCss, parseTokens, resolveToken, THEME_PATH, tokenReferences } from "./lib/tokens.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Runtime state/geometry, not independent design defaults. Keep this list narrow.
const RUNTIME = new Set([
  "--cl-press-scale",
  "--cl-press-duration",
  "--cl-press-ease",
  "--cl-squircle-radius",
  "--cl-anchored-padding-x",
  "--cl-anchored-padding-y",
  "--cl-overlay-exit-sentinel",
  "--transform-origin",
  "--anchor-width",
  "--available-width",
  "--available-height",
  "--positioner-width",
  "--positioner-height",
  "--popup-width",
  "--popup-height",
  "--cl-tooltip-content-enter-x",
  "--cl-tooltip-content-enter-y",
  "--cl-tooltip-content-exit-x",
  "--cl-tooltip-content-exit-y",
]);
const COLOR_NAMES = (
  "background panel frost control control-highlight floating on-floating selection track " +
  "separator outline outline-strong foreground foreground-secondary foreground-tertiary " +
  "foreground-hint foreground-disabled accent accent-background on-accent selection-accent " +
  "success warning warning-background danger danger-background on-danger scrim"
).split(" ");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function color(value) {
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) return true;
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*(\d*\.?\d+)\)$/.exec(value);
  return rgb?.slice(1, 4).every((channel) => Number(channel) <= 255) && Number(rgb[4]) <= 1;
}

// Strip complete var() calls, including fallbacks, before looking for literals.
function withoutVars(value) {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    if (value.startsWith("var(", i)) {
      let depth = 1;
      i += 4;
      for (; i < value.length && depth; i++) {
        if (value[i] === "(") depth++;
        if (value[i] === ")") depth--;
      }
      assert(!depth, `Unclosed var(): ${value}`);
      i--;
      result += "TOKEN";
    } else result += value[i];
  }
  return result;
}

function checkDesignValue(value, context) {
  for (const fallback of value.matchAll(/var\(\s*--[\w-]+\s*,\s*([^()]*)\)/g)) {
    checkDesignValue(fallback[1], `${context} fallback`);
  }
  const literal = withoutVars(value);
  assert(
    !/#(?:[\da-f]{3,8})\b|\b(?:rgb|rgba|hsl|hsla|oklab|oklch|color-mix|cubic-bezier|linear)\(/i.test(
      literal,
    ),
    `Hardcoded design value in ${context}: ${value}`,
  );
  assert(
    !/\b(?:white|black|red|blue|gray|grey)\b/i.test(literal),
    `Hardcoded color in ${context}: ${value}`,
  );
  for (const match of literal.matchAll(/(?<![\w-])(-?\d*\.?\d+)(px|rem|em|ms|s|%)?(?![\w-])/g)) {
    const number = Number(match[1]);
    const unit = match[2] ?? "";
    assert(
      number === 0 || (number === 1 && (unit === "" || unit === "px")),
      `Hardcoded design value in ${context}: ${value}`,
    );
  }
}

function utilityName(value) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "[" || value[i] === "(") depth++;
    if (value[i] === "]" || value[i] === ")") depth--;
    if (!depth && value[i] === ":") start = i + 1;
  }
  return value.slice(start);
}

function checkComponent(source, filename, tokens, references) {
  // TS 7's scanner skips comments and decodes actual string literals. We
  // deliberately require static class strings; interpolation could conceal
  // arbitrary values. Full component syntax is covered by the typecheck job.
  const scanner = createScanner(true, LanguageVariant.JSX, source);
  const lexemes = [];
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    assert(!scanner.isUnterminated(), `Unterminated TSX literal in ${filename}`);
    assert(kind !== SyntaxKind.TemplateHead, `Use static token classes in ${filename}`);
    lexemes.push({ kind, value: scanner.getTokenValue(), text: scanner.getTokenText() });
  }
  let strings = 0;
  const has = (name) => Object.hasOwn(tokens.shared, name);
  for (let index = 0; index < lexemes.length; index++) {
    const node = lexemes[index];
    if (
      node.kind === SyntaxKind.StringLiteral ||
      node.kind === SyntaxKind.NoSubstitutionTemplateLiteral
    ) {
      strings++;
      const value = node.value;
      references(value, filename);
      for (const part of value.split(/\s+/)) {
        const utility = utilityName(part);
        if (utility.startsWith("[--cl-")) {
          const colon = utility.indexOf(":");
          const name = utility.slice(1, colon);
          assert(RUNTIME.has(name), `Token redeclaration outside theme in ${filename}: ${name}`);
          checkDesignValue(utility.slice(colon + 1, -1), filename);
        }
        const arbitrary =
          /^(?:h|w|size|min-h|min-w|max-h|max-w|text|font|leading|tracking|rounded|duration|ease|scale|bg|border|outline|shadow|p[xytrbl]?|m[xytrbl]?|gap)-\[(.*)\]$/.exec(
            utility,
          );
        if (arbitrary) checkDesignValue(arbitrary[1], `${filename}: ${utility}`);
        assert(
          !/^(?:duration|scale|tracking|leading)-\d/.test(utility),
          `Hardcoded utility in ${filename}: ${utility}`,
        );
        assert(
          !/^h-[1-9]\d*(?:\.\d+)?$/.test(utility),
          `Use control-height tokens in ${filename}: ${utility}`,
        );
        const semantic =
          /^(bg|text|border|outline|rounded|shadow|ease|font|h|size)-([a-z][\w-]*)$/.exec(utility);
        if (!semantic) continue;
        const [, prefix, name] = semantic;
        const structural = new Set([
          "none",
          "transparent",
          "current",
          "inherit",
          "full",
          "fit",
          "auto",
          "px",
          "left",
          "right",
          "center",
          "justify",
          "ellipsis",
          "clip",
          "solid",
          "dashed",
          "dotted",
          "double",
          "hidden",
        ]);
        if (structural.has(name)) continue;
        const candidates = {
          bg: [`--color-${name}`],
          text: [`--color-${name}`, `--text-${name}`],
          border: [`--color-${name}`],
          outline: [`--color-${name}`],
          rounded: [`--radius-${name}`],
          shadow: [`--shadow-${name}`],
          ease: [`--ease-${name}`],
          font: [`--font-${name}`, `--font-weight-${name}`],
          h: [`--spacing-${name}`],
          size: [`--spacing-${name}`],
        }[prefix];
        assert(candidates.some(has), `Unknown token utility in ${filename}: ${utility}`);
      }
    }
    if (
      lexemes[index + 1]?.kind === SyntaxKind.ColonToken &&
      /^(?:height|fontSize|fontWeight|letterSpacing|lineHeight|backgroundColor|color|borderRadius|outlineOffset|transitionDuration|scale)$/.test(
        node.value || node.text,
      )
    ) {
      const next = lexemes[index + 2];
      if (
        next &&
        [
          SyntaxKind.NumericLiteral,
          SyntaxKind.StringLiteral,
          SyntaxKind.NoSubstitutionTemplateLiteral,
        ].includes(next.kind)
      ) {
        checkDesignValue(next.value || next.text, `${filename}: ${node.text}`);
      }
    }
  }
  assert(strings > 0, `No component strings checked in ${filename}`);
}

/**
 * Whitespace between CSS tokens is insignificant, and a formatter is free to put
 * a line break inside a `var()` or before a comma. Equality on a declared value
 * is therefore equality on the token stream, not on the layout it arrived in.
 * Whitespace inside a quoted string is still significant and is left alone.
 */
const canonical = (value) =>
  value.replace(/\s*([(),])\s*|\s+/g, (_match, punctuation) => punctuation ?? " ");

/** Pure entry point for mutation tests and downstream verification. Throws on
 * contract violations; checks declarations, references, schemes, derivations
 * and component consumption rather than comparing copied design values.
 */
export function validateTokens({ themeCss, baseCss, components }) {
  const tokens = parseTokens(themeCss);
  const known = new Set([...Object.keys(tokens.shared), ...Object.keys(tokens.schemes.dark)]);
  const references = (value, context, runtime = true) => {
    for (const name of tokenReferences(value)) {
      assert(
        known.has(name) || (runtime && RUNTIME.has(name)),
        `Unknown token ${name} in ${context}`,
      );
    }
    for (const match of value.matchAll(/\(\s*(--[\w-]+)\s*\)/g)) {
      assert(
        known.has(match[1]) || (runtime && RUNTIME.has(match[1])),
        `Unknown token ${match[1]} in ${context}`,
      );
    }
  };
  const dark = Object.keys(tokens.schemes.dark).sort();
  const light = Object.keys(tokens.schemes.light).sort();
  assert(JSON.stringify(dark) === JSON.stringify(light), "Dark/light scheme completeness mismatch");
  for (const scheme of ["dark", "light"]) {
    for (const name of COLOR_NAMES) {
      assert(
        Object.hasOwn(tokens.schemes[scheme], `--cl-${name}`),
        `Missing ${scheme} scheme token --cl-${name}`,
      );
      assert(
        canonical(tokens.shared[`--color-${name}`]) === canonical(`var(--cl-${name})`),
        `Missing scheme alias --color-${name}`,
      );
    }
    for (const [name, value] of Object.entries(tokens.schemes[scheme])) {
      assert(
        !Object.hasOwn(tokens.shared, name),
        `Scheme token duplicates shared declaration: ${name}`,
      );
      assert(
        color(resolveToken(tokens, name, scheme)),
        `Invalid color ${name} in ${scheme}: ${value}`,
      );
    }
    for (const name of Object.keys(tokens.shared)) {
      const value = resolveToken(tokens, name, scheme);
      if (
        /^--(?:spacing(?:-|$)|radius-|blur-|container-|text-[a-z-]+$)/.test(name) &&
        !/--(?:font-weight|line-height|letter-spacing)$/.test(name)
      ) {
        assert(
          /^(?:\d*\.?\d+)(?:px|rem|em)$/.test(value),
          `Invalid dimension token ${name}: ${value}`,
        );
      }
      if (/^--cl-duration-/.test(name)) {
        assert(/^(?:\d*\.?\d+)(?:ms|s)$/.test(value), `Invalid duration token ${name}: ${value}`);
      }
    }
  }
  for (const { property, value, block } of tokens.declarations) {
    references(value, `theme ${property}`, false);
    if (property.startsWith("--")) {
      assert(known.has(property), `Unknown theme override ${property}`);
      if (block.parent) {
        assert(
          block.parent.selector === "@media (prefers-reduced-motion: reduce)" &&
            block.selector === ":root" &&
            /^--ease-cl-spring-(?:overlay|press)$/.test(property),
          `Unexpected theme override ${property} in ${block.selector}`,
        );
      } else {
        assert(
          block.selector.startsWith("@theme") ||
            block.selector === ".light" ||
            block.selector.split(",").some((selector) => selector.trim() === ".dark"),
          `Unexpected token declaration ${property} in ${block.selector}`,
        );
      }
    }
  }
  for (const [name, value] of Object.entries(generateSpringTokens(tokens))) {
    assert(
      canonical(tokens.shared[name]) === canonical(value),
      `Generated spring drift: ${name}; run pnpm tokens`,
    );
  }
  const base = parseCss(baseCss);
  assert(base.declarations.length > 0, "No base CSS declarations checked");
  for (const { property, value } of base.declarations) {
    references(value, `base ${property}`);
    assert(
      !tokenReferences(value).some((name) => name.startsWith("--color-")),
      `Base CSS must consume runtime --cl-* colors, not inherited @theme aliases: ${property}`,
    );
    if (property.startsWith("--"))
      assert(RUNTIME.has(property), `Token redeclaration outside theme: ${property}`);
    checkDesignValue(value, `base ${property}`);
    if (/^(?:color|background-color|outline-color|border-color)$/.test(property)) {
      assert(
        /^(?:TOKEN|transparent|currentColor|inherit)$/.test(withoutVars(value)),
        `Hardcoded color in base ${property}: ${value}`,
      );
    }
  }
  assert(Object.keys(components).length > 0, "No components checked");
  for (const [filename, source] of Object.entries(components))
    checkComponent(source, filename, tokens, references);
  return {
    shared: Object.keys(tokens.shared).length,
    scheme: dark.length,
    components: Object.keys(components).length,
  };
}

export function readTokenSources(root = ROOT) {
  const ui = path.join(root, "packages/claralight/src/ui");
  const styles = path.join(root, "packages/claralight/styles");
  // Every primitive sheet is held to one contract, however the files are split
  // for copy-in consumers. `theme.css` declares the tokens the others consume,
  // and `index.css` only re-exports them.
  const primitives = readdirSync(styles)
    .filter((name) => name.endsWith(".css") && name !== "theme.css" && name !== "index.css")
    .sort();
  return {
    themeCss: readFileSync(path.join(styles, "theme.css"), "utf8"),
    baseCss: primitives.map((name) => readFileSync(path.join(styles, name), "utf8")).join("\n"),
    components: Object.fromEntries(
      readdirSync(ui)
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => [name, readFileSync(path.join(ui, name), "utf8")]),
    ),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateTokens(readTokenSources());
    console.log(
      `Token contract OK: ${result.shared} shared, ${result.scheme} colors per scheme, ${result.components} components (${path.relative(ROOT, THEME_PATH)})`,
    );
  } catch (error) {
    console.error(`Token contract FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
