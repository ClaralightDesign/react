/**
 * ClaraLight Design for React.
 *
 * Tokens live in CSS, not in JS: import `@claralight-design/react/styles.css` (or the
 * two files separately) once in your global stylesheet alongside Tailwind v4.
 * Theme values are defined only in CSS. A light/dark class swap updates the
 * cascade; Squircle synchronizes its SVG effects with the computed styles.
 */

export {
  type AnchoredSide,
  AnchoredSurface,
  type AnchoredSurfaceProps,
  type SurfaceGeometry,
  surfacePath,
} from "@/lib/anchored";
export {
  type RadiusToken,
  Squircle,
  type SquircleProps,
} from "@/lib/squircle";
export { cn } from "@/lib/utils";
export { Button, type ButtonProps, buttonVariants } from "@/ui/button";
export {
  Card,
  CardContent,
  type CardContentProps,
  CardDescription,
  type CardDescriptionProps,
  CardFooter,
  type CardFooterProps,
  CardHeader,
  type CardHeaderProps,
  type CardProps,
  CardTitle,
  type CardTitleProps,
  cardVariants,
} from "@/ui/card";
export {
  Dialog,
  DialogBackdrop,
  type DialogBackdropProps,
  DialogClose,
  type DialogCloseProps,
  DialogDescription,
  type DialogDescriptionProps,
  DialogPopup,
  type DialogPopupProps,
  DialogTitle,
  type DialogTitleProps,
  DialogTrigger,
  type DialogTriggerProps,
} from "@/ui/dialog";
export { Input, type InputProps, inputVariants } from "@/ui/input";
export {
  Popover,
  PopoverArrow,
  PopoverBackdrop,
  PopoverClose,
  type PopoverCloseProps,
  PopoverContent,
  type PopoverContentProps,
  PopoverDescription,
  type PopoverDescriptionProps,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTitle,
  type PopoverTitleProps,
  PopoverTrigger,
  type PopoverTriggerProps,
} from "@/ui/popover";
export {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  type ScrollAreaEdge,
  type ScrollAreaOrientation,
  type ScrollAreaProps,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  type ScrollbarVisibility,
} from "@/ui/scroll-area";
export {
  Select,
  SelectContent,
  type SelectContentProps,
  SelectGroup,
  SelectGroupLabel,
  type SelectGroupLabelProps,
  type SelectGroupProps,
  SelectIcon,
  type SelectIconProps,
  SelectItem,
  SelectItemIndicator,
  type SelectItemIndicatorProps,
  type SelectItemProps,
  SelectItemText,
  type SelectItemTextProps,
  SelectLabel,
  type SelectLabelProps,
  SelectList,
  SelectPopup,
  SelectPortal,
  SelectPositioner,
  SelectSeparator,
  type SelectSeparatorProps,
  SelectTrigger,
  type SelectTriggerProps,
  SelectValue,
  type SelectValueProps,
} from "@/ui/select";
export {
  Tooltip,
  TooltipArrow,
  TooltipContent,
  type TooltipContentProps,
  TooltipGroup,
  type TooltipGroupProps,
  type TooltipMotion,
  TooltipPopup,
  TooltipPortal,
  TooltipPositioner,
  type TooltipProps,
  TooltipProvider,
  type TooltipProviderProps,
  TooltipTrigger,
  type TooltipTriggerProps,
  TooltipViewport,
} from "@/ui/tooltip";
