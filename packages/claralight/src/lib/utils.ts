import type { ClassValue } from "cn";
import { createCn } from "cn/config";

/**
 * Tailwind's `text-*`, `shadow-*` and `ring-*` prefixes each cover two
 * unrelated utility groups — a value (`text-lg` font size, `shadow-lg`, ...)
 * and a color (`text-red-500`, `shadow-red-500`, ...). Class-merge libraries
 * decide which group a class belongs to by recognising the value, and they
 * cannot recognise a token that only exists in ClaraLight's `@theme`.
 *
 * The failure is silent and destructive. `text-title` reads as a *color* to
 * both `cn` and `tailwind-merge`, so:
 *
 *   cn("text-title text-foreground")  ->  "text-foreground"
 *
 * The font size is gone, with no warning. Every ClaraLight type step is
 * affected because they are all custom names, which is why registering them
 * here is not optional.
 *
 * `cn/config` is `cn`'s twin of `extendTailwindMerge`; `createCn` returns a
 * `cn` with the same signature. The groups below are the *value* groups, which
 * is what the token names actually mean. Colors need no registration: unknown
 * values already fall through to the color group, which is the right answer
 * for them.
 *
 * Regression-tested in `utils.spec.ts` — if a token is added to `theme.css`
 * without being added here, that test is what catches it.
 */
export const cn: (...inputs: ClassValue[]) => string = createCn({
  extend: {
    classGroups: {
      /* --text-* in theme.css */
      "font-size": [
        {
          text: [
            "display",
            "headline",
            "title",
            "body",
            "callout",
            "label",
            "caption",
            "mono",
            "mono-strong",
            "button",
          ],
        },
      ],
      /* --shadow-* in theme.css */
      shadow: [{ shadow: ["frost", "panel", "dialog"] }],
      /* Named component geometry must also yield to caller overrides. */
      h: [{ h: ["control-sm", "control-md", "control-lg"] }],
      size: [{ size: ["icon-sm", "icon-md", "icon-lg"] }],
      rounded: [{ rounded: ["item"] }],
    },
  },
});

/**
 * A token's leading number, in the unit the token was written in: px as px,
 * durations as milliseconds.
 *
 * Custom properties are substituted, not computed, so the unit comes back as it
 * was authored — and a `450ms` in the source is `.45s` in the built sheet. A
 * duration therefore has to be converted rather than read at face value: 0.45 is
 * a dwell that has already elapsed, and anything comparing a token against a
 * clock counts in the milliseconds it was written in.
 */
export function tokenNumber(value: string): number | undefined {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) return undefined;
  return value.endsWith("ms") ? number : value.endsWith("s") ? number * 1000 : number;
}
