# Fonts

`theme.css` names four preferred families. This package currently ships
**no font files** — the token layer supplies platform fallbacks. Rendering and
metrics depend on the fonts installed by the consumer; they are not guaranteed
to match the preferred faces.

## What the design language expects

| Family | Role | Token | Source / license |
| --- | --- | --- | --- |
| MiSans | UI text, Chinese + Latin (variable) | `--font-sans` | [hyperos.mi.com/font](https://hyperos.mi.com/font) — MiSans 字体知识产权许可协议, free commercial use & redistribution |
| Sarasa Mono SC | Numeric values and units | `--font-mono` | [be5invis/Sarasa-Gothic](https://github.com/be5invis/Sarasa-Gothic) v1.0.40 — SIL OFL 1.1 |
| ChillDINGothic | Large display headings | `--font-display` | [Warren2060/ChillDIN-ChillDINGothic](https://github.com/Warren2060/ChillDIN-ChillDINGothic) v1.300 — SIL OFL 1.1 |
| Clara Serif Pro | Optional serif, not in the default ramp | `--font-serif` | Obtain the font and verify its license before redistribution |

Check the license accompanying each actual font file before shipping it.

## To ship them

1. Obtain licensed font files from their upstream sources and convert to
   woff2 for web delivery. Keep a variable version when the required weight
   range and download size justify it.

2. Subset for the languages the application supports. Preserve required CJK
   coverage; use separate `@font-face` declarations with `unicode-range`
   splits where useful. Do not assume an upstream file is already subset.

3. Add the files in this directory (or a CDN), create the corresponding
   `@font-face` stylesheet, and import it from `index.css`.

## MiSans' wght axis is not standard

Verify the named instances in the exact MiSans VF file you ship. The following
mapping has been used for MiSans files with non-standard weight positions;
it is not a guarantee for every release:

| CSS `font-weight` | MiSans `wght` axis | Named instance |
| --- | --- | --- |
| 400 | **330** | Regular |
| 500 | **380** | Medium |
| 600 | **450** | Demibold |
| 700 | **520** | Semibold |

For a file with this mapping, axis position 600 is above Semibold, not
Demibold. If explicit axis settings are needed, define the mapping as tokens
in `theme.css`, then consume them rather than repeating axis values:

```css
/* Instead of relying on font-weight alone. */
.cl-weight-title {
  font-variation-settings: "wght" var(--cl-font-axis-title);
}
```

Because `font-variation-settings` is a single property, the token ramp's
`--text-*--font-weight` values are the *intent* (700/600/500/400). They land
according to the loaded font's metadata; on fallback fonts the browser uses
the available weights. The example axis token above is not shipped yet.

Rather than hand-maintaining a utility per step, add a
`@utility cl-wght-{400,500,600,700}` set in `theme.css` that maps to
330/380/450/520 during the font drop-in.
