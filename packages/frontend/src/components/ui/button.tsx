import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "./utils";
import "./button.css";

const VARIANT_VALUES = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
  "link",
] as const;

const SIZE_VALUES = ["default", "sm", "lg", "icon"] as const;

type ButtonVariant = (typeof VARIANT_VALUES)[number];
type ButtonSize = (typeof SIZE_VALUES)[number];

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

/**
 * Utility kept for external consumers that previously relied on
 * `buttonVariants` to derive class names. It now returns an empty
 * string (all styling is driven by data attributes), but the export
 * signature is preserved so call-sites don't break.
 */
function buttonVariants(_opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  return _opts?.className ?? "";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
