import "./prism-manual";
import Prism from "prismjs";
/*
 * `prismjs` itself is core + markup + clike + javascript, which is most of the
 * chain already; tsx needs jsx and typescript layered on top, in that order,
 * because Prism languages extend each other through the shared global as they
 * evaluate. Only `css` comes along unused, which is a smaller price than a
 * hand-written declaration file for the untyped `components/` subpaths.
 */
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";

/*
 * Resolved once, and loudly. `Prism.languages` is a plain object populated by
 * side effect, so a broken or reordered import above would leave `tsx`
 * undefined and `Prism.highlight` would quietly return the source unstyled.
 * Failing here instead turns that into a build-time-visible error: the gallery
 * check asserts no page produces a console error.
 */
const TSX: Prism.Grammar = (() => {
  const tsx = Prism.languages.tsx;
  if (!tsx) throw new Error("Prism: the tsx grammar did not load — check the import order above.");
  return tsx;
})();

/**
 * Highlights a TSX source string to Prism's token markup.
 *
 * The gallery deliberately does not ship a Prism theme stylesheet: every one of
 * them hardcodes a palette, which would be the only colour on the site that
 * does not move when the scheme does. `.token` classes are styled from
 * ClaraLight tokens in `index.css` instead, so Prism owns the lexing and the
 * design language still owns the colour.
 */
export function highlight(code: string): string {
  return Prism.highlight(code, TSX, "tsx");
}
