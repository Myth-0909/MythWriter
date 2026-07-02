import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full resize-none rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-900 outline-none transition-all duration-200 placeholder:text-surface-400 hover:border-surface-300 focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 dark:hover:border-surface-600",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
