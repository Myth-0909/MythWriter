import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import "./RotatingText.css";

interface RotatingTextProps extends HTMLAttributes<HTMLSpanElement> {
  texts: string[];
  interval?: number;
  itemClassName?: string;
}

export function RotatingText({
  texts,
  interval = 2600,
  className,
  itemClassName,
  ...props
}: RotatingTextProps) {
  const [index, setIndex] = useState(0);
  const items = useMemo(() => texts.filter(Boolean), [texts]);

  useEffect(() => {
    if (items.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    const timer = window.setInterval(() => {
      setIndex((previous) => (previous + 1) % items.length);
    }, interval);

    return () => window.clearInterval(timer);
  }, [interval, items.length]);

  if (items.length === 0) return null;

  const current = items[index % items.length];

  return (
    <span
      {...props}
      className={cn("rotating-text", className)}
      aria-label={props["aria-label"] ?? items.join(" ")}
    >
      <span key={`${current}-${index}`} className={cn("rotating-text__item", itemClassName)} aria-hidden="true">
        {current}
      </span>
    </span>
  );
}
