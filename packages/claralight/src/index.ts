/**
 * ClaraLight Design for React.
 *
 * Tokens live in CSS, not in JS: import `@claralight/react/styles.css` (or the
 * two files separately) once in your global stylesheet alongside Tailwind v4.
 * Nothing here ships a runtime theme, which is what keeps theming zero-cost and
 * lets the light/dark swap happen in a single CSS class.
 */

export {
  RADIUS_FALLBACK,
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
