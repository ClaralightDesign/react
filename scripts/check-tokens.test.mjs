import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { readTokenSources, validateTokens } from "./check-tokens.mjs";
import { generateSpringTokens } from "./gen-spring.mjs";
import { parseCss, parseTokens, readTokens, resolveToken } from "./lib/tokens.mjs";

const sources = readTokenSources();
const theme = parseTokens(sources.themeCss);
const rejectTheme = (css, message) =>
  assert.throws(() => validateTokens({ ...sources, themeCss: css }), message);
const rejectBase = (css, message) =>
  assert.throws(() => validateTokens({ ...sources, baseCss: css }), message);
const rejectComponent = (source, message) =>
  assert.throws(
    () => validateTokens({ ...sources, components: { "negative.tsx": source } }),
    message,
  );

function replaceToken(name, value) {
  const old = `${name}: ${theme.shared[name]};`;
  assert.ok(sources.themeCss.includes(old), `Fixture token missing: ${name}`);
  return sources.themeCss.replace(old, `${name}: ${value};`);
}

test("the real repository contract checks nonempty declarations and consumers", () => {
  const result = validateTokens(sources);
  assert.ok(result.shared > 0);
  assert.ok(result.scheme > 0);
  assert.ok(result.components > 0);
});

test("parser supports formatting/comments and exposes raw values plus scheme aliases", () => {
  const reformatted = sources.themeCss.replace(":root,\n.dark {", ":root, /* default */ .dark\n{");
  const parsed = parseTokens(reformatted);
  assert.deepEqual(parsed.shared, readTokens().shared);
  for (const scheme of ["dark", "light"]) {
    assert.equal(
      resolveToken(parsed, "--color-background", scheme),
      parsed.schemes[scheme]["--cl-background"],
    );
  }
  assert.equal(parsed.shared["--ease-cl-spring-press"], theme.shared["--ease-cl-spring-press"]);
});

test("theme edits are authoritative, not compared against a copied color table", () => {
  const css = sources.themeCss.replace(theme.schemes.dark["--cl-background"], "#203040");
  assert.doesNotThrow(() => validateTokens({ ...sources, themeCss: css }));
});

test("empty/comment-only/truncated theme cannot pass vacuously", () => {
  for (const css of ["", "/* --cl-background: #ffffff; */", sources.themeCss.slice(0, -3)]) {
    rejectTheme(css, /Missing|Unterminated/);
  }
});

test("missing light block or one scheme declaration fails", () => {
  rejectTheme(sources.themeCss.replace(".light {", ".not-light {"), /Missing light scheme/);
  const declaration = `--cl-background: ${theme.schemes.light["--cl-background"]};`;
  rejectTheme(sources.themeCss.replace(declaration, ""), /scheme completeness/);
});

test("removing a public color from both schemes still fails", () => {
  let css = sources.themeCss;
  for (const scheme of ["dark", "light"]) {
    css = css.replace(`--cl-background: ${theme.schemes[scheme]["--cl-background"]};`, "");
  }
  rejectTheme(css, /Missing dark scheme token/);
});

test("duplicate declarations and unexpected conditional overrides fail", () => {
  rejectTheme(`${sources.themeCss}\n@theme static { --spacing: 8px; }`, /Duplicate token/);
  rejectTheme(
    `${sources.themeCss}\n@media print { :root { --spacing: 8px; } }`,
    /Unexpected theme override/,
  );
});

test("unknown aliases and alias cycles fail", () => {
  rejectTheme(replaceToken("--spacing", "var(--not-declared)"), /Unknown token/);
  rejectTheme(replaceToken("--spacing", "var(--spacing)"), /Token cycle/);
});

test("malformed color and dimension declarations fail", () => {
  rejectTheme(
    sources.themeCss.replace(theme.schemes.dark["--cl-background"], "rgb(999 0 0 / 2)"),
    /Invalid color/,
  );
  rejectTheme(replaceToken("--spacing-control-md", "bananas"), /Invalid dimension/);
});

test("base CSS unknown references and token redeclarations fail", () => {
  rejectBase(".x { color: var(--cl-does-not-exist); }", /Unknown token/);
  rejectBase(".x { --cl-duration-fast: 200ms; }", /Token redeclaration/);
  rejectBase("/* .x { color: var(--color-accent); } */", /No base CSS/);
});

test("base CSS design literals fail while structural values are allowed", () => {
  for (const declaration of [
    "height: 48px",
    "font-size: 17px",
    "scale: 0.95",
    "transition-duration: 160ms",
    "outline-offset: 2px",
    "color: magenta",
    "background-color: #fff",
    "--cl-press-ease: cubic-bezier(0.25, 1, 0.5, 1)",
    "transform: scale(var(--cl-press-scale, 1.05))",
  ])
    rejectBase(`.x { ${declaration}; }`, /Hardcoded/);
  assert.doesNotThrow(() =>
    validateTokens({
      ...sources,
      baseCss: ".x { opacity: 0; border: 1px solid var(--cl-outline); transform: scale(1); }",
    }),
  );
});

test("base colors cannot regress to aliases resolved on a different ancestor", () => {
  rejectBase(".x { color: var(--color-accent); }", /runtime --cl-\* colors/);
});

test("every public shadow utility reads its token at runtime", () => {
  const { blocks } = parseCss(sources.baseCss);
  const shadows = Object.keys(theme.shared).filter((name) => name.startsWith("--shadow-"));
  assert.ok(shadows.length > 0);
  for (const name of shadows) {
    const utility = blocks.find((block) => block.selector === `@utility ${name.slice(2)}`);
    assert.ok(utility, `Missing runtime shadow utility ${name}`);
    assert.deepEqual(utility.declarations, [{ property: "box-shadow", value: `var(${name})` }]);
  }
});

test("component unknown explicit references and semantic utilities fail", () => {
  for (const classes of [
    "duration-(--cl-missing)",
    "text-missing",
    "h-control-missing",
    "bg-red-500",
  ])
    rejectComponent(`const classes = "${classes}";`, /Unknown token/);
});

test("component hardcoded design values fail in variant strings and inline styles", () => {
  for (const classes of [
    "h-9",
    "h-[48px]",
    "text-[17px]/[22px]",
    "duration-[140ms]",
    "duration-150",
    "hover:scale-[1.05]",
    "[--cl-press-scale:1.05]",
    "hover:bg-[color-mix(in_oklab,var(--color-accent)_92%,white)]",
  ])
    rejectComponent(`const classes = "${classes}";`, /Hardcoded|control-height/);
  rejectComponent('const styles = { fontSize: 17 }; const label = "x";', /Hardcoded/);
});

test("comment-only component and interpolated classes cannot claim coverage", () => {
  rejectComponent('// const classes = "text-foreground";', /No component strings/);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture code, not interpolation here.
  rejectComponent("const classes = `text-${size}`;", /static token classes/);
  assert.throws(() => validateTokens({ ...sources, components: {} }), /No components/);
});

test("spring generation consumes theme parameters and detects derived drift", () => {
  assert.equal(
    generateSpringTokens(theme)["--ease-cl-spring-press"],
    theme.shared["--ease-cl-spring-press"],
  );
  const changed = replaceToken("--cl-spring-press-stiffness", "530");
  assert.notEqual(
    generateSpringTokens(parseTokens(changed))["--ease-cl-spring-press"],
    theme.shared["--ease-cl-spring-press"],
  );
  rejectTheme(changed, /Generated spring drift/);
  rejectTheme(replaceToken("--ease-cl-spring-press", "linear(0, 1)"), /Generated spring drift/);
  rejectTheme(replaceToken("--cl-spring-press-mass", "0"), /Invalid spring token/);
});

test("CLI works without HOME or any external token repository", () => {
  const output = execFileSync(process.execPath, ["scripts/check-tokens.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { PATH: process.env.PATH },
    encoding: "utf8",
  });
  assert.match(output, /Token contract OK/);
});
