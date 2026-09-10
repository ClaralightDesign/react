"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * ClaraLight text field.
 *
 * The fill is `control` — a translucent overlay rather than an opaque colour —
 * so the same field reads correctly whether it sits on `background` or on a
 * `panel`. That is the core trick of the layered surface stack and it is why
 * this component must not hard-code a background.
 */
export const inputVariants = cva(
  [
    "w-full border border-outline",
    "bg-control font-sans text-foreground",
    "placeholder:text-foreground-hint",
    "transition-[background-color,border-color,color] duration-[140ms] ease-cl-out",
    "hover:bg-control-highlight",
    "data-[disabled]:pointer-events-none",
    "data-[disabled]:text-foreground-disabled data-[disabled]:placeholder:text-foreground-disabled",
    // Set by Base UI when the field sits inside a Field.Root.
    "data-[invalid]:border-danger",
  ],
  {
    variants: {
      /** `CLControlSize` heights: 28 / 36 / 44. */
      size: {
        sm: "h-7 px-2 text-caption",
        md: "h-9 px-3 text-callout",
        lg: "h-11 px-4 text-body",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type InputProps = Omit<ComponentProps<typeof BaseInput>, "className" | "size"> &
  VariantProps<typeof inputVariants> & {
    className?: string;
    /** Applied to the wrapper, which is what a caller's layout sizes. */
    wrapperClassName?: string;
  };

/**
 * A ClaraLight text field.
 *
 * `size="sm"` and `size="md"` use `callout` (14/19 semibold); `lg` uses `body`
 * (15/20 medium). The Flutter field does the same size-dependent swap, and it
 * is why dense inspector rows stay legible without shrinking the hit target.
 *
 * Note the `size` in `InputProps` is the ClaraLight density step, not the
 * native `<input size>` character-width hint — the native attribute is omitted
 * above, because the two collide and an intersection would make both unusable.
 */
export function Input({ className, wrapperClassName, size, ...props }: InputProps) {
  return (
    <Squircle
      asChild
      radius="control"
      ring="field"
      wrapperClassName={cn("block w-full", wrapperClassName)}
    >
      <BaseInput className={cn(inputVariants({ size }), className)} {...props} />
    </Squircle>
  );
}
