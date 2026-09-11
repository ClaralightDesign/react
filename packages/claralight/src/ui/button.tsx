"use client";

import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * ClaraLight button variants.
 *
 * `secondary` is the default because ClaraLight is a tool-like design
 * language: most buttons in a real screen are neutral glass controls, and the
 * accent should mark one primary action per view, not every button.
 */
export const buttonVariants = cva(
  [
    "inline-flex select-none items-center justify-center gap-2",
    "border font-sans whitespace-nowrap",
    // Icons inherit the variant's foreground through currentColor.
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed",
  ],
  {
    variants: {
      /**
       * Filled variants use the theme's perceptual hover mix. `ghost` instead
       * reveals a fill, because lifting nothing is still nothing.
       *
       * Disabled behaviour is deliberate and differs per variant: neutral
       * controls keep their glass layer, and semantic actions keep their
       * identity — except `danger`, which drops its colour so a destructive
       * action never reads as available.
       */
      variant: {
        primary: [
          "border-outline bg-accent text-on-accent",
          "hover:bg-accent-hover",
          "data-[disabled]:text-foreground-disabled",
        ],
        secondary: [
          "border-outline bg-floating text-on-floating backdrop-blur-frost",
          "hover:bg-floating-hover",
          "data-[disabled]:text-foreground-disabled",
        ],
        ghost: [
          "border-transparent bg-transparent text-foreground",
          "hover:bg-control-highlight",
          "data-[disabled]:text-foreground-disabled",
        ],
        danger: [
          "border-outline bg-danger text-on-danger",
          "hover:bg-danger-hover",
          "data-[disabled]:border-transparent data-[disabled]:bg-control",
          "data-[disabled]:text-foreground-disabled",
        ],
      },
      /**
       * Heights, icon geometry, press travel and label typography come from
       * theme tokens. Smaller controls travel further in relative terms.
       */
      size: {
        sm: ["h-control-sm gap-1.5 px-3 text-label", "[&_svg]:size-icon-sm"],
        md: ["h-control-md gap-2 px-4 text-label", "[&_svg]:size-icon-md"],
        lg: ["h-control-lg gap-2 px-4 text-button", "[&_svg]:size-icon-lg"],
      },
    },
    defaultVariants: { variant: "secondary", size: "lg" },
  },
);

const pressScales = {
  sm: "[--cl-press-scale:var(--cl-press-scale-sm)]",
  md: "[--cl-press-scale:var(--cl-press-scale-md)]",
  lg: "[--cl-press-scale:var(--cl-press-scale-lg)]",
} as const;

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> &
  VariantProps<typeof buttonVariants> & {
    /** Applied to the clipped element: fill, border, label. */
    className?: string;
    /**
     * Applied to the wrapper, which is what a caller's flex or grid lays out —
     * put width, margin and placement here.
     */
    wrapperClassName?: string;
  };

/**
 * A ClaraLight capsule button.
 *
 * Wraps Base UI's `Button` rather than rendering a bare `<button>`: that gives
 * the `render` prop for polymorphism (rendering an `<a>` while keeping button
 * semantics), and correct disabled behaviour for non-native elements, which a
 * plain `disabled` attribute cannot express.
 *
 * @example
 * <Button variant="primary">Upload</Button>
 * <Button render={<a href="/docs" />}>Docs</Button>
 */
export function Button({ className, wrapperClassName, variant, size, ...props }: ButtonProps) {
  return (
    /*
     * `.cl-press` sits on the wrapper so the press scale moves fill, border and
     * shadow together — the SVG overlays are siblings of the shape, so scaling
     * the shape alone would tear the 1px border off the edge. `:active`
     * propagates to ancestors, so the wrapper sees the press with no JS.
     *
     * `ring` puts the focus indicator on the same element, because `clip-path`
     * crops `outline` to nothing on the shape.
     */
    <Squircle
      asChild
      radius="capsule"
      ring
      wrapperClassName={cn(
        "cl-press inline-flex shrink-0",
        pressScales[size ?? "lg"],
        wrapperClassName,
      )}
    >
      <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />
    </Squircle>
  );
}
