# Fonts

The Flutter package bundles four families. This package currently ships
**none of them** — the token layer references them by name with fallbacks, so
everything renders and measures correctly today, and you can drop the real
faces in later.

## What the design language expects

| Family | Role | Token | Source / license |
| --- | --- | --- | --- |
| MiSans | UI text, Chinese + Latin (variable) | `--font-sans` | [hyperos.mi.com/font](https://hyperos.mi.com/font) — MiSans 字体知识产权许可协议, free commercial use & redistribution |
| Sarasa Mono SC | Numeric values and units | `--font-mono` | [be5invis/Sarasa-Gothic](https://github.com/be5invis/Sarasa-Gothic) v1.0.40 — SIL OFL 1.1 |
| ChillDINGothic | Large display headings | `--font-display` | [Warren2060/ChillDIN-ChillDINGothic](https://github.com/Warren2060/ChillDIN-ChillDINGothic) v1.300 — SIL OFL 1.1 |
| Clara Serif Pro | Optional serif, not in the default ramp | `--font-serif` | bundled with Claralight |

All four are free for commercial use and redistribution.

## To ship them

1. Convert the TTFs from
   `ClaralightDesign-Flutter/packages/claralight_ui/fonts/` to woff2.
   TTF is what Flutter needs; the web wants woff2, and MiSans VF is the only
   file that justifies keeping a variable version.

2. Subset before shipping. Sarasa Mono SC is already subset to Latin-1 plus
   common punctuation upstream — do the same for it and for ChillDINGothic.
   MiSans must keep full CJK coverage, which is why it stays a variable font
   and is served as a separate `@font-face` with
   `unicode-range` splits per script block.

3. Drop the files in this directory (or a CDN) and uncomment `fonts.css` in
   `index.css`.

## MiSans' wght axis is not standard

This is the trap that makes a naive port render wrong weights everywhere.
MiSans VF's named instances do not sit at CSS-standard axis positions:

| CSS `font-weight` | MiSans `wght` axis | Named instance |
| --- | --- | --- |
| 400 | **330** | Regular |
| 500 | **380** | Medium |
| 600 | **450** | Demibold |
| 700 | **520** | Semibold |

So `font-weight: 600` picks the axis position 600, which lands between
Demibold and Semibold — too light. `CLTypography` works around this by setting
`fontVariations` explicitly, and the web needs the same treatment:

```css
/* Instead of relying on font-weight alone. */
.cl-weight-title {
  font-variation-settings: "wght" 450;
}
```

Because `font-variation-settings` is a single property, the token ramp's
`--text-*--font-weight` values are the *intent* (700/600/500/400). They land
exactly once MiSans is loaded **and** this axis mapping is applied; on fallback
fonts the browser approximates, which is the correct degradation.

Rather than hand-maintaining a utility per step, add a
`@utility cl-wght-{400,500,600,700}` set in `theme.css` that maps to
330/380/450/520 during the font drop-in.
