import { forwardRef } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { OverlayScrollbarsComponentProps, OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/ThemeProvider";

interface ScrollbarProps extends OverlayScrollbarsComponentProps {
  className?: string;
}

export const Scrollbar = forwardRef<OverlayScrollbarsComponentRef, ScrollbarProps>(function Scrollbar(
  { className, children, options, events, ...props },
  ref
) {
  const { theme } = useTheme();
  const themeName = theme === "dark" ? "os-theme-znwriter-dark" : "os-theme-znwriter-light";

  const callerScrollbars = (options && typeof options === "object" && "scrollbars" in options)
    ? (options as any).scrollbars : {};

  const mergedOptions: OverlayScrollbarsComponentProps["options"] = {
    ...(options && typeof options === "object" ? options : {}),
    scrollbars: {
      theme: themeName,
      autoHide: "leave",
      autoHideDelay: 800,
      dragScroll: true,
      clickScroll: true,
      ...callerScrollbars,
    },
  };

  return (
    <OverlayScrollbarsComponent
      ref={ref}
      options={mergedOptions}
      events={events}
      className={cn("os-host-flex", className)}
      {...props}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
});
