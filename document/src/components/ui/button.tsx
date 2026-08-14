import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-brand-500/65 dark:focus-visible:ring-offset-surface-950 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:text-surface-950 dark:shadow-brand-950/30 dark:hover:bg-brand-300 dark:active:bg-brand-200",
        destructive: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
        outline:
          "border border-surface-300 bg-transparent text-surface-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 active:border-brand-400 active:bg-brand-100 dark:border-surface-700 dark:text-surface-200 dark:hover:border-brand-500/45 dark:hover:bg-brand-500/10 dark:hover:text-brand-200 dark:active:border-brand-400/60 dark:active:bg-brand-500/15",
        secondary:
          "border border-brand-200 bg-brand-50 text-brand-700 shadow-sm shadow-brand-500/10 hover:bg-brand-100 active:bg-brand-200 dark:border-brand-500/25 dark:bg-brand-500/12 dark:text-brand-200 dark:hover:bg-brand-500/18 dark:active:bg-brand-500/25",
        ghost: "text-surface-700 hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 dark:text-surface-200 dark:hover:bg-brand-500/10 dark:hover:text-brand-200 dark:active:bg-brand-500/15",
        link: "text-brand-700 underline-offset-4 hover:underline dark:text-brand-300",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-8 w-8",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
