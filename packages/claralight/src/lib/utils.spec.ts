import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cn } from "./utils";

const THEME_CSS = readFileSync(
  fileURLToPath(new URL("../../styles/theme.css", import.meta.url)),
  "utf8",
);

/**
 * Every `--text-*` name declared in the theme, i.e. the ClaraLight type ramp.
 *
 * The trailing `[a-z]+` groups deliberately exclude the double dash, so
 * Tailwind v4's modifier syntax (`--text-display--line-height`) is not mistaken
 * for a type step called `display--line-height`.
 */
function declaredTypeSteps(): string[] {
  return [...THEME_CSS.matchAll(/^\s*--text-([a-z]+(?:-[a-z]+)*):/gm)].map((m) => m[1] as string);
}

/** Every `--shadow-*` name declared in the theme. */
function declaredShadows(): string[] {
  return [...THEME_CSS.matchAll(/^\s*--shadow-([a-z]+(?:-[a-z]+)*):/gm)].map((m) => m[1] as string);
}

describe("cn", () => {
  describe("behaves like clsx + tailwind-merge", () => {
    it("joins conditional, array, object and falsy inputs", () => {
      expect(
        cn("p-2", false, null, undefined, ["m-1", ["mt-4"]], {
          "text-danger": true,
          "text-hint": false,
        }),
      ).toBe("p-2 m-1 mt-4 text-danger");
    });

    it("resolves conflicts in favour of the last class", () => {
      expect(cn("px-4", "px-6")).toBe("px-6");
      expect(cn("bg-panel", "bg-control")).toBe("bg-control");
      expect(cn("rounded-full", "rounded-md")).toBe("rounded-md");
    });

    it("keeps one value per class group across arbitrary values", () => {
      expect(cn("mt-[10px]", "mt-[20px]")).toBe("mt-[20px]");
      expect(cn("grid-cols-[repeat(auto-fill,minmax(0,1fr))]", "grid-cols-3")).toBe("grid-cols-3");
    });

    it("keeps both members of the value/colour pairs", () => {
      // The classic ambiguity: `border-2` is a width, `border-outline` a colour.
      expect(cn("border-2", "border-outline")).toBe("border-2 border-outline");
      expect(cn("outline-1", "outline-outline-strong")).toBe("outline-1 outline-outline-strong");
      expect(cn("blur-frost", "blur-sm")).toBe("blur-frost blur-sm");
    });

    it("handles modifiers, important and negative values", () => {
      expect(cn("md:px-2 lg:px-8", "md:py-4")).toBe("md:px-2 lg:px-8 md:py-4");
      expect(cn("-mt-2", "mt-0")).toBe("mt-0");
      // Same modifier + same group collapses, with or without `!`.
      expect(cn("!p-4", "!p-2")).toBe("!p-2");
      expect(cn("hover:!p-4", "hover:!p-2")).toBe("hover:!p-2");
      /*
       * `!` starts a separate class group, so an important and a normal class
       * are both kept — the merge library cannot know which wins, and dropping
       * either would be a guess. Verified identical to tailwind-merge.
       */
      expect(cn("!p-4", "p-2")).toBe("!p-4 p-2");
    });
  });

  /**
   * The reason `utils.ts` configures `createCn` at all.
   *
   * Tailwind's `text-*` prefix covers both font size and text colour, and a
   * library that does not recognise a value files it under colour. Every
   * ClaraLight type step is a custom name, so an unconfigured `cn` deletes the
   * font size from any component that also sets a text colour.
   *
   * This drives the assertions off `theme.css`, so adding a token there without
   * registering it in `utils.ts` fails the suite instead of silently shipping.
   */
  describe("ClaraLight token ambiguity", () => {
    it("declares type steps in the theme (the test would be vacuous otherwise)", () => {
      expect(declaredTypeSteps()).toEqual(
        expect.arrayContaining(["display", "title", "body", "label", "mono"]),
      );
    });

    it("keeps every type step when merged with a text colour", () => {
      for (const step of declaredTypeSteps()) {
        const merged = cn(`text-${step}`, "text-foreground");
        expect(merged, `text-${step} was swallowed by text-foreground`).toContain(`text-${step}`);
        expect(merged).toContain("text-foreground");
      }
    });

    it("keeps every type step when merged with a translucent colour", () => {
      for (const step of declaredTypeSteps()) {
        expect(cn(`text-${step}`, "text-foreground/80")).toContain(`text-${step}`);
      }
    });

    it("lets caller utilities override tokenized component geometry", () => {
      for (const size of ["sm", "md", "lg"]) {
        expect(cn(`h-control-${size}`, "h-12")).toBe("h-12");
        expect(cn("h-12", `h-control-${size}`)).toBe(`h-control-${size}`);
        expect(cn(`[&_svg]:size-icon-${size}`, "[&_svg]:size-6")).toBe("[&_svg]:size-6");
      }
      expect(cn("rounded-item", "rounded-lg")).toBe("rounded-lg");
      expect(cn("text-button", "text-label", "text-foreground")).toBe("text-label text-foreground");
    });

    it("still collapses two type steps into the last one", () => {
      const steps = declaredTypeSteps();
      const [first, second] = steps;
      expect(cn(`text-${first}`, `text-${second}`)).toBe(`text-${second}`);
    });

    it("keeps every shadow token when merged with a shadow colour", () => {
      for (const shadow of declaredShadows()) {
        const merged = cn(`shadow-${shadow}`, "shadow-danger");
        expect(merged, `shadow-${shadow} was swallowed by shadow-danger`).toContain(
          `shadow-${shadow}`,
        );
      }
    });

    it("still collapses two shadow tokens into the last one", () => {
      const shadows = declaredShadows();
      const [first, second] = shadows;
      expect(cn(`shadow-${first}`, `shadow-${second}`)).toBe(`shadow-${second}`);
    });
  });
});
