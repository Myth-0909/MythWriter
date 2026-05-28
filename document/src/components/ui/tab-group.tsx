import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  label: ReactNode;
  value: string;
}

interface TabGroupProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export function TabGroup({ items, value, onChange, className, size = "sm" }: TabGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeIndex = items.findIndex((item) => item.value === value);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  // Measure active tab position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll("button");
    const activeBtn = buttons[activeIndex];
    if (!activeBtn) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    setPillStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    });
  }, [activeIndex, items.length]);

  // Recompute on resize
  useEffect(() => {
    const handler = () => {
      const container = containerRef.current;
      if (!container) return;
      const buttons = container.querySelectorAll("button");
      const activeBtn = buttons[activeIndex];
      if (!activeBtn) return;
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setPillStyle({ left: btnRect.left - containerRect.left, width: btnRect.width });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [activeIndex]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center gap-0 rounded-lg bg-surface-100 p-1 dark:bg-surface-800",
        size === "sm" && "text-xs",
        className
      )}
    >
      {/* Sliding pill */}
      <div
        className="absolute top-1 h-8 rounded-md bg-white shadow-sm transition-all duration-300 ease-out dark:bg-surface-700"
        style={{
          left: pillStyle.left,
          width: pillStyle.width,
          transform: "none",
        }}
      />
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "relative z-10 flex h-8 items-center justify-center rounded-md px-3 font-medium transition-colors cursor-pointer",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            item.value === value
              ? "text-surface-900 dark:text-surface-100"
              : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
