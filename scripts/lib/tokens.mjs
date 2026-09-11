import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const THEME_PATH = fileURLToPath(
  new URL("../../packages/claralight/styles/theme.css", import.meta.url),
);

/** Small balanced CSS reader for our token dialect (not a general CSS parser).
 * Unlike a declaration regex, it rejects unbalanced/empty input and retains
 * block ancestry, so media overrides cannot masquerade as scheme declarations.
 */
export function parseCss(css) {
  const blocks = [];
  const declarations = [];
  const stack = [];
  let text = "";
  let quote = "";
  let depth = 0;
  let comment = false;
  const statement = () => {
    /*
     * Values are token streams, so a run of whitespace means one space — including
     * the line breaks a formatter may introduce inside a `var()`. Normalizing here
     * keeps every comparison below a comparison of tokens rather than of layout.
     */
    const value = text.replace(/\s+/g, " ").trim();
    text = "";
    if (!value || value.startsWith("@")) return;
    const colon = value.indexOf(":");
    if (!stack.length || colon < 1) throw new Error(`Invalid CSS statement: ${value}`);
    const property = value.slice(0, colon).trim();
    const raw = value.slice(colon + 1).trim();
    if (!/^-{0,2}[a-zA-Z][\w-]*$/.test(property) || !raw) {
      throw new Error(`Invalid CSS declaration: ${value}`);
    }
    const declaration = { property, value: raw, block: stack.at(-1) };
    declarations.push(declaration);
    stack.at(-1).declarations.push({ property, value: raw });
  };
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (comment) {
      if (char === "*" && css[i + 1] === "/") {
        comment = false;
        i++;
        text += " ";
      }
      continue;
    }
    if (quote) {
      text += char;
      if (char === "\\") text += css[++i] ?? "";
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "/" && css[i + 1] === "*") {
      comment = true;
      i++;
    } else if (char === '"' || char === "'") {
      quote = char;
      text += char;
    } else if (char === "(" || char === "[") {
      depth++;
      text += char;
    } else if (char === ")" || char === "]") {
      if (--depth < 0) throw new Error("Unbalanced CSS value");
      text += char;
    } else if (depth === 0 && char === "{") {
      const selector = text.trim();
      if (!selector) throw new Error("Missing CSS selector");
      const block = { selector, parent: stack.at(-1), declarations: [] };
      blocks.push(block);
      stack.push(block);
      text = "";
    } else if (depth === 0 && char === ";") {
      statement();
    } else if (depth === 0 && char === "}") {
      statement();
      if (!stack.pop()) throw new Error("Unexpected CSS closing brace");
    } else text += char;
  }
  if (comment || quote || depth || stack.length || text.trim()) {
    throw new Error("Unterminated CSS input");
  }
  return { blocks, declarations };
}

/** Raw strings indexed by full CSS names. `shared` is @theme; schemes contain
 * only their explicit declarations (never inherited defaults). */
export function parseTokens(css) {
  const parsed = parseCss(css);
  const shared = {};
  const schemes = { dark: {}, light: {} };
  const seen = new Set();
  for (const block of parsed.blocks) {
    if (block.parent) continue;
    const selectors = block.selector.split(",").map((s) => s.trim());
    let target;
    if (/^@theme(?:\s+(?:inline|static))*$/.test(block.selector)) target = shared;
    else if (selectors.length === 2 && selectors.includes(":root") && selectors.includes(".dark")) {
      target = schemes.dark;
      if (seen.has("dark")) throw new Error("Duplicate dark scheme");
      seen.add("dark");
    } else if (block.selector === ".light") {
      target = schemes.light;
      if (seen.has("light")) throw new Error("Duplicate light scheme");
      seen.add("light");
    }
    if (!target) continue;
    for (const { property, value } of block.declarations) {
      if (!property.startsWith("--")) continue;
      if (Object.hasOwn(target, property)) throw new Error(`Duplicate token ${property}`);
      target[property] = value;
    }
  }
  if (!Object.keys(shared).length) throw new Error("Missing shared theme tokens");
  for (const scheme of ["dark", "light"]) {
    if (!seen.has(scheme) || !Object.keys(schemes[scheme]).length) {
      throw new Error(`Missing ${scheme} scheme tokens`);
    }
  }
  return { shared, schemes, ...parsed };
}

export function readTokens(file = THEME_PATH) {
  return parseTokens(readFileSync(file, "utf8"));
}

/** Resolve theme aliases, retaining CSS functions/units for browser comparison.
 * No fallback to a second design table: missing names and cycles are errors.
 */
export function resolveToken(tokens, name, scheme = "dark", visiting = []) {
  if (!Object.hasOwn(tokens.schemes, scheme)) throw new Error(`Unknown scheme ${scheme}`);
  if (visiting.includes(name)) throw new Error(`Token cycle: ${[...visiting, name].join(" -> ")}`);
  const value = tokens.schemes[scheme][name] ?? tokens.shared[name];
  if (value === undefined) throw new Error(`Unknown token ${name} in ${scheme}`);
  let resolved = "";
  let start = 0;
  for (const match of value.matchAll(/var\(/g)) {
    if (match.index < start) continue;
    let end = match.index + 4;
    let depth = 1;
    for (; end < value.length && depth; end++) {
      if (value[end] === "(") depth++;
      if (value[end] === ")") depth--;
    }
    if (depth) throw new Error(`Unclosed var() in ${name}`);
    const argument = value.slice(match.index + 4, end - 1);
    const reference = argument.split(",", 1)[0].trim();
    if (!/^--[\w-]+$/.test(reference)) throw new Error(`Invalid var() in ${name}`);
    resolved += value.slice(start, match.index);
    // Even aliases with fallbacks must name declared tokens; fallbacks must
    // not conceal missing design values or create a second default table.
    resolved += resolveToken(tokens, reference, scheme, [...visiting, name]);
    start = end;
  }
  return resolved + value.slice(start);
}

export function tokenReferences(value) {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);
}
