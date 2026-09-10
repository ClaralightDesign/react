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
       * Filled variants lift 8% toward white on hover, the same
       * `Color.lerp(fill, white, 0.08)` the Flutter button performs.
       * `ghost` instead reveals a fill, because lifting nothing is still
       * nothing.
       *
       * The interpolation is `oklab`, not `srgb`. Flutter's `Color.lerp` is a
       * channel-wise lerp in gamma space, which `oklab` does not reproduce
       * exactly — on `danger` it lands about 3/255 away on the green channel.
       * That is imperceptible, and oklab's perceptual uniformity means the same
       * 8% lift reads consistently across hues, where a gamma-space lerp would
       * lift the dark `floating` fill far less than the bright `accent` one.
       *
       * Disabled behaviour is deliberate and differs per variant: neutral
       * controls keep their glass layer, and semantic actions keep their
       * identity — except `danger`, which drops its colour so a destructive
       * action never reads as available.
       */
      variant: {
        primary: [
          "border-outline bg-accent text-on-accent",
          "hover:bg-[color-mix(in_oklab,var(--color-accent)_92%,white)]",
          "data-[disabled]:text-foreground-disabled",
        ],
        secondary: [
          "border-outline bg-floating text-on-floating backdrop-blur-frost",
          "hover:bg-[color-mix(in_oklab,var(--color-floating)_92%,white)]",
          "data-[disabled]:text-foreground-disabled",
        ],
        ghost: [
          "border-transparent bg-transparent text-foreground",
          "hover:bg-control-highlight",
          "data-[disabled]:text-foreground-disabled",
        ],
        danger: [
          "border-outline bg-danger text-on-danger",
          "hover:bg-[color-mix(in_oklab,var(--color-danger)_92%,white)]",
          "data-[disabled]:border-transparent data-[disabled]:bg-control",
          "data-[disabled]:text-foreground-disabled",
        ],
      },
      /**
       * Heights are `CLControlSize` (28/36/44).
       *
       * `--cl-press-scale` is derived as `1 + 4 / height / 2`, so a shorter
       * control travels further in relative terms and every size feels equally
       * responsive.
       *
       * Label type differs by size: `medium` and up use `CLTypography.label`
       * (13/17 bold), while `lg` is `title` re-weighted to 500 and bumped to
       * 17/22 with tighter tracking, matching `CLButton._textStyle`.
       */
      size: {
        sm: ["h-7 gap-1.5 px-3 text-label", "[--cl-press-scale:1.0714] [&_svg]:size-[15px]"],
        md: ["h-9 gap-2 px-4 text-label", "[--cl-press-scale:1.0556] [&_svg]:size-[18px]"],
        lg: [
          "h-11 gap-2 px-4 text-[17px]/[22px] font-medium tracking-[-0.43px]",
          "[--cl-press-scale:1.0455] [&_svg]:size-6",
        ],
      },
    },
    defaultVariants: { variant: "secondary", size: "lg" },
  },
);

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
      wrapperClassName={cn("cl-press inline-flex shrink-0", wrapperClassName)}
    >
      <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />
    </Squircle>
  );
}
