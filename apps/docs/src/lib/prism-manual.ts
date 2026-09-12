/**
 * Sets Prism's manual flag before the core is evaluated.
 *
 * Prism reads `window.Prism.manual` at definition time and otherwise registers
 * a `DOMContentLoaded` handler that walks the whole document looking for
 * `language-*` elements to highlight. The gallery highlights explicitly, so
 * that pass has nothing to find — but ES module imports are hoisted, so a bare
 * assignment next to `import "prismjs/components/prism-core"` would run *after*
 * the core had already made up its mind. A separate module is the only ordering
 * hook available: side-effect imports evaluate in source order.
 */
declare global {
  interface Window {
    Prism?: { manual?: boolean };
  }
}

window.Prism = { manual: true };
