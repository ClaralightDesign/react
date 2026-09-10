import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  platform: "neutral",
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  /*
   * `unbundle` keeps one output module per source module instead of one flat
   * bundle, so a consumer importing only `Button` never has to tree-shake
   * Select and Dialog out of a single chunk. The package's `sideEffects` field
   * lists only CSS globs, which is what makes that safe.
   */
  unbundle: true,
  /*
   * Everything the consumer must supply. React and Base UI are peers so the
   * library never forces a second copy into the tree; `cn` is a direct
   * dependency and is left external so the consumer's own `cn` config wins.
   */
  deps: {
    neverBundle: ["react", "react-dom", "react/jsx-runtime", "@base-ui/react", "cn"],
  },
  /*
   * Components import through the `@/` alias, because that is what the shadcn
   * CLI rewrites when it copies a file into a consumer project
   * (`@/lib/utils` -> the consumer's `aliases.utils`, `@/components/ui/*` ->
   * `aliases.ui`). The alias only exists inside this repo, so the build folds
   * it back to relative paths.
   */
  alias: {
    "@": new URL("./src", import.meta.url).pathname,
  },
});
