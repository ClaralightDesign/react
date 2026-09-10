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
          ],
        },
      ],
      /* --shadow-* in theme.css */
      shadow: [{ shadow: ["frost", "panel", "dialog"] }],
    },
  },
});
