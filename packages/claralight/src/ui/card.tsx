import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { type RadiusToken, Squircle } from "@/lib/squircle";
import { cn } from "@/lib/utils";

/**
 * Card surfaces, mapped onto the ClaraLight layer stack.
 *
 * `panel` is a container sitting on the window background (the default).
 * `control` puts the card *inside* a panel, where the translucent overlay
 * reads correctly over `--color-panel`.
 * `frost` is for cards that float over arbitrary content and need a backdrop
 * blur.
 *
 * The corner shape itself is not here: `Squircle` owns it, and renders these
 * classes onto the clipped element while the SVG border and shadow overlays go
 * on its wrapper. So `border-*` and `shadow-*` below are declarations Lisse
 * reads and re-renders as squircle-shaped SVG, not declarations that paint.
 */
export const cardVariants = cva(["text-foreground", "[&_svg]:shrink-0"], {
  variants: {
    variant: {
      panel: "border border-outline bg-panel shadow-panel",
      control: "border border-outline bg-control",
      frost: "cl-frost",
    },
  },
  defaultVariants: { variant: "panel" },
});

export interface CardProps extends ComponentProps<"div">, VariantProps<typeof cardVariants> {
  /** Applied to the clipped element: fill, padding, grid placement inside the card. */
  className?: string;
  /**
   * Applied to the layout wrapper, which is the element the caller's grid or
   * flex actually lays out. Put span and size classes here —
   * `wrapperClassName="sm:col-span-2"`, not `className`.
   */
  wrapperClassName?: string;
  /** Which `--radius-*` token shapes the corners. */
  radius?: RadiusToken;
  /** Figma's `xi`; see `Squircle`. */
  smoothing?: number;
  children?: ReactNode;
}

/** A ClaraLight surface. Compose with the parts below, or use it bare. */
export function Card({
  className,
  wrapperClassName,
  variant,
  radius = "medium",
  smoothing,
  children,
  ...props
}: CardProps) {
  return (
    <Squircle
      radius={radius}
      smoothing={smoothing}
      wrapperClassName={wrapperClassName}
      className={cn(cardVariants({ variant }), className)}
      data-cl-slot="card"
      {...props}
    >
      {children}
    </Squircle>
  );
}

export type CardHeaderProps = ComponentProps<"div">;
export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      data-cl-slot="card-header"
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    />
  );
}

export type CardTitleProps = ComponentProps<"h3">;

/**
 * `headline` (18/24 bold, tightened to -0.55px) rather than `title`, so a card
 * title outranks the row text it contains.
 */
export function CardTitle({ className, ...props }: CardTitleProps) {
  return (
    <h3
      data-cl-slot="card-title"
      className={cn("text-headline text-foreground", className)}
      {...props}
    />
  );
}

export type CardDescriptionProps = ComponentProps<"p">;

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      data-cl-slot="card-description"
      className={cn("text-caption text-foreground-tertiary", className)}
      {...props}
    />
  );
}

export type CardContentProps = ComponentProps<"div">;

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      data-cl-slot="card-content"
      className={cn("px-4 pb-4 [&:first-child]:pt-4", className)}
      {...props}
    />
  );
}

export type CardFooterProps = ComponentProps<"div">;

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      data-cl-slot="card-footer"
      className={cn("flex items-center gap-2 px-4 pb-4", className)}
      {...props}
    />
  );
}
