import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import { shouldReduceMotion } from "@/lib/motionPreference";
import { cn } from "@/lib/utils";
import "./RotatingText.css";

interface RotatingTextProps extends HTMLAttributes<HTMLSpanElement> {
  texts: string[];
  interval?: number;
  itemClassName?: string;
  respectReducedMotion?: boolean;
}

export function RotatingText({
  texts,
  interval = 2600,
  className,
  itemClassName,
  respectReducedMotion = true,
  ...props
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);
  const items = useMemo(() => texts.filter(Boolean), [texts]);

  useEffect(() => {
    if (items.length <= 1) return;
    if (shouldReduceMotion({ respectReducedMotion })) return;

    const timer = window.setInterval(() => {
      setIndex((previous) => (previous + 1) % items.length);
    }, interval);

    return () => window.clearInterval(timer);
  }, [interval, items.length, respectReducedMotion]);

  if (items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <span
      {...props}
      className={cn("rotating-text", className)}
      data-respect-reduced-motion={respectReducedMotion ? "true" : "false"}
      aria-label={props["aria-label"] ?? items.join(" ")}
    >
      <span key={`${current}-${index}`} className={cn("rotating-text__item", itemClassName)} aria-hidden="true">
        {current}
      </span>
    </span>
  );
}
