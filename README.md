# ClaraLight Design — React

The ClaraLight design language for React. Base UI primitives, Tailwind v4 tokens,
and code you own.

[`packages/claralight/styles/theme.css`](packages/claralight/styles/theme.css) is
the design source of truth. Components consume its tokens; checks validate local
declarations, references and rendered behavior. No other repository is required.

This repository is not published. The workflows below build and test locally;
none publish, push or deploy anything.

---

## Two ways to consume it

The npm package and copy-in registry share component source. Each distribution
path has its own validation; sharing source does not replace consumer tests.

### Copy the source in (the shadcn model)

Build and serve the registry locally:

```sh
pnpm registry:build
python3 -m http.server 5555 --bind 127.0.0.1 --directory public
```

In an existing React / Tailwind v4 consumer, merge this into `components.json`:

```json
{
  "registries": {
    "@claralight": "http://127.0.0.1:5555/r/{name}.json"
  }
}
```

Use `aliases.lib: "@/lib"`. Both TypeScript and the CSS bundler must resolve `@`
to `src`; for Vite configure `resolve.alias`, not only tsconfig paths. The
`tailwind.css` entry must point to the app's imported global stylesheet, which
already imports `tailwindcss`.

```sh
pnpm dlx shadcn@4.21.0 add @claralight/button
```

The component pulls in shared files and dependencies, and the CLI adds theme/base
CSS imports. Do not replace an existing `utils.ts` without reviewing the diff:
ClaraLight needs its token-aware class merger. No public registry URL is assumed.
`pnpm check:registry` tests this setup with a real CLI install in a temporary app.

### Test the package locally

Create a local tarball (the `prepack` hook builds and typechecks it):

```sh
pnpm --filter @claralight/react pack --pack-destination /tmp
```

In a consumer project, install the generated tarball plus the declared peers:

```sh
pnpm add /tmp/claralight-react-0.1.0.tgz @base-ui/react react react-dom
```

```css
/* app.css */
@import "tailwindcss";
@import "@claralight/react/styles.css";
```

Dark is the default; add `.light` to `<html>` for the warm scheme. `.dark` is
also accepted. Tokens can be scoped to an ancestor. Squircle reads the local
cascade and updates its SVG effects when theme classes, props or inline tokens
change, without remounting children.

---

## Layout

```
registry.json                  shadcn registry: 1 base + 7 components
packages/claralight/           @claralight/react
  styles/theme.css             design values and spring parameters
  styles/base.css              the primitives: press, frost, focus, entrance
  src/lib/utils.ts             cn(), with the class-group fix described below
  src/lib/squircle.tsx         the smooth-corner primitive
  src/lib/anchored.tsx         the anchored-overlay primitive
  src/ui/*.tsx                 components, one file each
apps/docs/                     the gallery — a real consumer of the built dist
scripts/                       local token, browser and registry checks
```

The gallery resolves `@claralight/react` through `package.json#exports` to
`dist/`, exactly as a consumer does. That is deliberate: aliasing it to `src/`
would render from a tree nobody else loads, so a broken `exports` map or a
`d.ts` that disagrees with the runtime would stay invisible. `pnpm dev` runs
`tsdown --watch` alongside Vite. `pnpm typecheck` first builds the library, so it
does not depend on a previous developer's dist.

---

## Toolchain

| | Version | Why this one |
| --- | --- | --- |
| Node | 24.18 | `tsdown` requires `^22.18 \|\| ^24.11 \|\| >=26` |
| pnpm | 11.5 | workspace `catalog:` protocol, lockfile supply-chain gating |
| TypeScript | 7.0 | strict typechecking; tsdown warns that its API is experimental |
| Vite | 8.3 | Rolldown-powered |
| tsdown | 0.23 | Rolldown + `rolldown-plugin-dts` |
| Tailwind | 4.3 | CSS-first `@theme` |
| Base UI | 1.8 | the primitives |
| Biome | 2.5 | lint and format in one pass |
| Vitest | 5.0 | Node unit and SSR tests |
| Puppeteer Core | 25 | actual browser behavior against built output |

### Two deliberate omissions

**`isolatedDeclarations` is off.** Public variant types rely on inference from
`cva`. Declaration generation uses TypeScript instead of introducing manually
maintained annotations solely for a faster build.

**`corner-shape` is unused.** See below.

---

## Corner shape

Every corner in the language is a smooth corner, and the web has two unrelated
curve families for that which **do not coincide**:

| | Construction | Support |
| --- | --- | --- |
| `corner-shape: superellipse(2)` | true Lamé superellipse, exponent `n = 4` | Chromium 139+ only |
| Figma corner smoothing | cubic Bézier shoulders bracketing a circular arc, `p = (1 + ξ)·R`, residual arc `90·(1 − ξ)°` | anywhere with JS |

ClaraLight follows the design, the design is drawn in Figma, and Figma draws the
second one. `@lisse/react` emits the same path construction across engines;
that does not guarantee identical font rendering or compositing across browsers.
Chromium's native `corner-shape` is a *different curve*, so it is not used even
though it is free there.

`--cl-corner-smoothing` is Figma's `ξ` and defaults to `0.6`, Figma's own
default. `apps/docs` has a **Corner shape** page that renders the ξ ladder
side by side, which is where the curve should be signed off.

### Integrating it has five non-obvious requirements

All five are handled in `src/lib/squircle.tsx` and `styles/base.css`, each for a
reason that is invisible until it breaks.

**1. The shape needs a wrapper.** Lisse re-renders borders and shadows as SVG
overlays appended to a positioned element that tightly wraps the shape, and
`clip-path` clips the shape's own painted border and box shadow to nothing. So
`Squircle` owns the wrapper — which is also why every component takes
`wrapperClassName`: the wrapper, not the shape, is what a caller's grid or flex
lays out.

**2. `clip-path` intersects `border-radius`.** The token radius is an inline CSS
fallback for SSR/first paint and is cleared once the path lands. Avoid adding
`rounded-*` to the shaped element. Caller `style` is merged, not overwritten.

**3. `clip-path` crops `outline`.** Measured: a 2px ring at 2px offset goes from
436 lit pixels to 0. The focus ring therefore rides on the wrapper, driven by
`:has(> [data-cl-squircle]:focus-visible)`, which keeps the browser's own
keyboard/pointer heuristic *and* the 2px offset the design asks for.

**4. Transforms belong on the wrapper, not the shape.** The overlays are siblings
of the shape, so moving the shape alone tears the 1px border away from the edge —
which is why `.cl-press`, `.cl-enter-root` and `.cl-anchored-root` sit on the
wrapper. Both entrance classes use the same `:has()` trick to lift Base UI's
`data-starting-style` / `data-ending-style` onto the wrapper, so a dialog's fill,
border and shadow scale as one object.

**5. One element, one `transition`.** `.cl-press` and `.cl-squircle-root` very
often land on the same element, and two `transition` declarations resolve by
source order — which silently replaced the press spring with an outline fade.
`.cl-press` owns the transition and lists `outline-color` alongside its own
properties.

### `data-cl-slot`, not `data-slot`

Lisse sets `data-slot="smooth-corners"` on every element it manages, and it
overwrites whatever was there. So ClaraLight's own markers are `data-cl-slot`,
matching the `--cl-*` token namespace. Using `data-slot` would have silently
erased the hook that every component test and consumer selector depends on.

---

## Anchored overlays

A popover's arrow is **not a second element**. It is spliced into the surface's
own smooth-corner path, which is forced by the design language rather than chosen
for elegance:

- the frost fill is translucent, so two overlapping elements composite their
alpha into a visible dark seam;
- the 1px outline would run straight across the tail's mouth.

Neither is a motion artifact; both are visible at rest. So `src/lib/anchored.tsx`
owns the shape instead of Lisse: the body still comes from `@lisse/core`'s
`generatePath`, because that construction is the design system's corner geometry
and must not be forked, and the tail is spliced into it. Lisse's edges are
discrete absolute `L` commands, so the splice is an edit rather than a boolean
union. Where the anchored edge has no straight run left — its two corners meet in
the middle of it — no splice can hold a 24px base, and the surface becomes a union
with the tail's base sunk under the body instead.

Three consequences are worth knowing:

**The tail is measured, not positioned.** Base UI's `Arrow` is rendered but never
painted. Floating UI writes the already-clamped arrow offset onto it and
`AnchoredSurface` reads that back to place the tail, so there is one source of
truth for where the anchor is — including after a flip, which moves the tail to
the opposite edge on its own. The read is offset geometry rather than rects,
because the first measurement happens on the frame the surface is still at scale
0, where every rect inside it has collapsed to a point.

**The entrance grows from the tail, not from 95%.** `--cl-enter-scale` is a nudge,
for a dialog that has no fixed point to grow from. An anchored overlay has one:
`transform-origin` is the tail's tip, and the surface unfolds from scale 0 on the
overlay spring. Opacity is untouched on the way in — that leg belongs to reduced
motion, which drops the growth and keeps the fade in its place.

**The tail moves the padding.** It lives inside the element's box, on the edge
opposite the resolved side, so `.cl-anchored-arrow[data-side="…"]` insets the
content by `--cl-arrow-extent` again. `[data-side]` is Base UI's and names the side
of the *anchor*, which is why the padding is keyed on the opposite edge.

---

## Component status

Five components are on `Squircle` and draw Figma smooth corners. The two anchored
overlays are on `AnchoredSurface`, which reserves the surface's outline for the
tail.

| Component | Shape | Wrapper carries |
| --- | --- | --- |
| `Button` | `--radius-capsule` clamped to `height/2` | press spring, focus ring |
| `Input` | `--radius-control` | focus ring (on `:focus`, because a field takes focus on click) |
| `Card` | `--radius-medium` | nothing — a surface does not take focus |
| `Dialog` | `--radius-dialog` | fixed positioning, centring, entrance spring |
| `Popover` | `--radius-panel` | `--transform-origin`, growth from the tail |
| `Select` | trigger `--radius-control`, popup `--radius-medium` | press spring, focus ring, `--transform-origin`, entrance |
| `Tooltip` | `--radius-medium` | as `Popover`, over an inert positioner |

Font assets are not bundled; see
[`styles/fonts/README.md`](packages/claralight/styles/fonts/README.md). Storybook,
gesture components and an additional motion runtime are not included.

### Known deviation: the Safari scale raster

Lisse documents that Safari caches the `clip-path` raster at the element's layout
size and upsamples it when an **ancestor** scales. ClaraLight's transforms are on
the wrapper, which is the shape's parent, so this applies: the press scales
1.0455x for 170ms, the dialog 0.95 → 1.0 over 250ms, and an anchored overlay grows
from 0 and overshoots to 1.011 on the way. Nothing is ever upsampled by more than
4.6%, and the growth is a downscale until its last frames.

The alternative — putting the transform on the shaped element — is worse on every
browser, because the SVG border and shadow would then not scale with the fill.

---

## The `cn` class-group fix

`src/lib/utils.ts` configures `createCn` rather than re-exporting `cn` directly,
and this is not optional.

Tailwind's `text-*`, `shadow-*` and `ring-*` prefixes each cover two unrelated
utility groups. A merge library decides which group a class belongs to by
recognising the value, and it cannot recognise a token that only exists in
ClaraLight's `@theme`. The failure is silent:

```
cn("text-title text-foreground")  ->  "text-foreground"
```

The font size is gone, with no warning. Every ClaraLight type step is affected
because they are all custom names. Registering them as an explicit class group
fixes it, and `src/lib/utils.spec.ts` drives its assertions off `theme.css`, so
adding a token without registering it fails the suite rather than shipping.

The adapter keeps the merge implementation behind one boundary. Removing its
custom groups fails the regression tests; it is not redundant wrapping.
Similarly, `unbundle: true` is retained: a Button-only Vite consumer measured
about 10 KB less gzip than a single flattened library bundle in the local audit.

---

## Verification

Use Node >=24.11 and the pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
```

`check` runs lint, local token validation, unit/SSR tests, fresh-build typechecks,
package exports validation, registry consumer installation and browser checks.
It neither publishes nor deploys. The registry smoke test installs dependencies
in a temporary directory and needs network access or a populated npm cache.

```sh
pnpm check:tokens      # local declarations, references and token contracts
pnpm tokens           # regenerate CSS springs from theme.css parameters
pnpm test             # checker negative cases, class merging, refs and SSR
pnpm typecheck        # builds the library before checking both packages
pnpm check:exports    # explicit fresh build, then publint
pnpm check:registry   # real CLI add, consumer typecheck and production build
pnpm check:gallery    # builds, starts a local server and tests Chromium behavior
```

The browser runner uses an installed Chromium-family browser. Set `CL_BROWSER`
to an executable when automatic detection cannot find yours. `CL_GALLERY_URL`
can point at an already-running preview instead of the managed local server.
There is no empty Vitest browser project or second browser automation stack.

Token expectations come from `theme.css`, not a duplicate palette or an external
repository. Browser tests verify the compiled CSS and actual behavior, including
pointer press/release, reduced motion, dialog focus, select keyboard interaction,
the anchored tail and entrance, and dynamic Squircle/ref integration. They are not
screenshot comparisons.

When adding a component, add a unit test for pure contracts and a browser case
for interaction or rendering. When adding a token, use it from component CSS and
extend the class merger if its utility prefix is ambiguous.

### Why `@theme static`

Every token block is `@theme static`. Tailwind drops unused theme variables by
default, which is reasonable for an app and wrong for a design system: these names
are the public API, and consumers read them at runtime or reference them from
hand-written CSS. `--ease-cl-drawer` and `--radius-sheet` were both silently
missing from the output until this was set.
