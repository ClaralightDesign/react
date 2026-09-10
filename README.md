# ClaraLight Design — React

The ClaraLight design language for React. Base UI primitives, Tailwind v4 tokens,
and code you own.

The design source of truth lives in
[`ClaralightDesign-Flutter`](../ClaralightDesign-Flutter) — a Flutter
implementation of the same language. This package reproduces it for the web; where
the two disagree, the Flutter package wins unless a decision is recorded below.

---

## Two ways to consume it

The same component source feeds both, so they cannot drift.

### Copy the source in (the shadcn model)

```sh
pnpm dlx shadcn@latest add <owner>/ClaralightDesign-React/button
```

Once the repository is public, its root `registry.json` is a shadcn registry and
needs no build step or server. A GitHub address is read straight from the repo at
a pinned ref, so consumers can also pin a tag:
`<owner>/ClaralightDesign-React/button#v0.1.0`.

Installing one component also installs the base (`theme.css`, `base.css`,
`utils.ts`, `squircle.tsx`) and the npm packages it needs, so a single `add`
produces a working component rather than one with undefined CSS variables.

From a local checkout, build the registry and serve it:

```sh
pnpm registry:build     # -> public/r/*.json
pnpm registry:validate
```

### Install the package

```sh
pnpm add @claralight/react @base-ui/react react react-dom
```

```css
/* app.css */
@import "tailwindcss";
@import "@claralight/react/styles.css";
```

`@claralight/react` never ships a runtime theme. Dark is the reference scheme and
the default; add `.light` to `<html>` for the warm scheme. `.dark` is also
accepted, for apps already toggling that class.

---

## Layout

```
registry.json                  shadcn registry: 1 base + 5 components
packages/claralight/           @claralight/react
  styles/theme.css             every design token. The heart of the port.
  styles/base.css              the primitives: press, frost, focus, entrance
  src/lib/utils.ts             cn(), with the class-group fix described below
  src/lib/squircle.tsx         the smooth-corner primitive
  src/ui/*.tsx                 components, one file each
apps/docs/                     the gallery — a real consumer of the built dist
scripts/                       the three checkers, not build steps
```

The gallery resolves `@claralight/react` through `package.json#exports` to
`dist/`, exactly as a consumer does. That is deliberate: aliasing it to `src/`
would render from a tree nobody else loads, so a broken `exports` map or a
`d.ts` that disagrees with the runtime would stay invisible. `pnpm dev` runs
`tsdown --watch` alongside Vite, which costs about 120ms per rebuild.

---

## Toolchain

| | Version | Why this one |
| --- | --- | --- |
| Node | 24.18 | `tsdown` requires `^22.18 \|\| ^24.11 \|\| >=26` |
| pnpm | 11.5 | workspace `catalog:` protocol, lockfile supply-chain gating |
| TypeScript | 7.0 | the native compiler, ~10x faster |
| Vite | 8.3 | Rolldown-powered |
| tsdown | 0.23 | Rolldown + `rolldown-plugin-dts` |
| Tailwind | 4.3 | CSS-first `@theme` |
| Base UI | 1.8 | the primitives |
| Biome | 2.5 | lint and format in one pass |
| Vitest | 5.0 | browser mode, split into unit and browser projects |

### Two deliberate omissions

**`isolatedDeclarations` is off.** It lets tsdown emit `.d.ts` through
oxc-transform instead of the TypeScript compiler, and it cannot coexist with
`cva`: `VariantProps<typeof buttonVariants>` needs the inferred return type, and
the flag requires an explicit annotation, which erases it. Instrumented, the
whole build including declarations is 117ms without it. Not worth the API damage.

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
second one — which is also the same family as Apple's
`cornerCurve = .continuous`. So `@lisse/react` emits that path in every engine,
and Safari, Firefox and Chromium agree pixel for pixel rather than approximately.
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

**2. `clip-path` intersects `border-radius`.** A `rounded-*` class left on the
clipped element squares the smooth corner back off. The radius goes in as an
inline style and Lisse clears it once the path lands, which doubles as the SSR and
first-paint fallback. `scripts/check-gallery.mjs` asserts the cleared value, so a
stray `rounded-*` fails the suite rather than quietly flattening every corner.

**3. `clip-path` crops `outline`.** Measured: a 2px ring at 2px offset goes from
436 lit pixels to 0. The focus ring therefore rides on the wrapper, driven by
`:has(> [data-cl-squircle]:focus-visible)`, which keeps the browser's own
keyboard/pointer heuristic *and* the 2px offset the design asks for.

**4. Transforms belong on the wrapper, not the shape.** The overlays are siblings
of the shape, so moving the shape alone tears the 1px border away from the edge —
which is why `.cl-press` and `.cl-enter-root` sit on the wrapper. `.cl-enter-root`
uses the same `:has()` trick to lift Base UI's `data-starting-style` /
`data-ending-style` onto the wrapper, so a dialog's fill, border and shadow scale
as one object.

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

## Component status

All five components are on `Squircle` and draw Figma smooth corners.

| Component | Shape | Wrapper carries |
| --- | --- | --- |
| `Button` | radius 999 clamped to `height/2` | press spring, focus ring |
| `Input` | `--radius-control` | focus ring (on `:focus`, because a field takes focus on click) |
| `Card` | `--radius-medium` | nothing — a surface does not take focus |
| `Dialog` | `--radius-dialog` | fixed positioning, centring, entrance spring |
| `Select` | trigger `--radius-control`, popup `--radius-medium` | press spring, focus ring, `--transform-origin`, entrance |

Not built yet: fonts (see
[`styles/fonts/README.md`](packages/claralight/styles/fonts/README.md) — the token
ramp works, the files are a drop-in), Storybook, and Motion. Motion is planned as
an **optional peer** for `Sheet`, `Drawer` and `Toast` only, where gesture and
momentum handling genuinely needs it; it is ~45KB gzip and the press spring is
already exact in CSS.

### Known deviation: the Safari scale raster

Lisse documents that Safari caches the `clip-path` raster at the element's layout
size and upsamples it when an **ancestor** scales. ClaraLight's transforms are on
the wrapper, which is the shape's parent, so this applies: the press scales
1.0455x for 170ms and the dialog 0.95 → 1.0 over 250ms. At those magnitudes the
upsampling is sub-pixel.

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

`cn` itself is [shadcn × aidenybai's `cn`](https://github.com/shadcn-ui/cn),
published September 2026 as a takeover of a dormant 2013 package name with the
original author still on the collaborator list. It is the same API as
`clsx + tailwind-merge`, and measurably ~6x faster on the repeated class strings
a component render actually produces, with identical output on 14 differential
cases. It is young, so `utils.ts` is deliberately a thin layer: reverting is three
lines and no component changes.

---

## Verification

Nothing here is a build step, and together they cover the parts that fail
silently.

```sh
pnpm check:tokens      # every --cl-* equals its CLColorScheme literal
pnpm typecheck         # both packages
pnpm lint              # Biome
pnpm test              # Vitest: cn class-group regression, node environment
node scripts/check-gallery.mjs   # 68 assertions against the built gallery
```

**`check-tokens.mjs`** diffs all 56 `--cl-*` values against
`CLColorScheme.dark()` and `.light()` in the Flutter source. The port is 56
hand-converted `0xRRGGBBAA` literals, which is exactly the work where one digit
goes wrong invisibly — it caught an `E5`/`E6` confusion in the light scheme's
`foreground-secondary`, a 0.004 alpha slip no one would ever have seen.

**`check-gallery.mjs`** drives the built gallery in Chromium and reads *computed*
styles, because that is the only place the whole chain is exercised:
`theme.css` → Tailwind's `@theme` → utilities → the class strings in `dist`. It
asserts the token values, the button contract (per-variant disabled behaviour,
the press scale, the 8% hover lift), the dialog's geometry and focus trap, the
select's `--transform-origin`, the Lisse pipeline (`p = (1 + ξ)·R` in the
generated path, cleared `border-radius`, stripped border and shadow, mounted SVG
overlays), and that every gallery page renders without console errors.

It is not a screenshot diff. A pixel baseline would need maintaining across font
loading and GPU differences, while computed styles assert the design contract
directly and fail with a readable value.

**Vitest** covers behaviour in a real browser, because focus traps, typeahead,
scroll locking and pointer capture are exactly what jsdom fakes badly. The
browser project needs a browser once: `pnpm exec playwright install chromium`, or
point it at one you have with `CL_BROWSER_CHANNEL=msedge pnpm test`.

### Why `@theme static`

Every token block is `@theme static`. Tailwind drops unused theme variables by
default, which is reasonable for an app and wrong for a design system: these names
are the public API, and consumers read them at runtime or reference them from
hand-written CSS. `--ease-cl-drawer` and `--radius-sheet` were both silently
missing from the output until this was set.
