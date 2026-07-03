import { useEffect, useRef, useState, type HTMLAttributes } from "react";

interface CountUpProps extends HTMLAttributes<HTMLSpanElement> {
  value: number;
  duration?: number;
  formatValue?: (value: number) => string;
}

const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);

export function CountUp({
  value,
  duration = 1200,
  formatValue = (nextValue) => Math.round(nextValue).toLocaleString(),
  ...props
}: CountUpProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches || duration <= 0) {
      previousValueRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startValue = previousValueRef.current;
    const delta = value - startValue;
    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplayValue(startValue + delta * easeOutCubic(progress));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previousValueRef.current = value;
        setDisplayValue(value);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, value]);

  return <span {...props}>{formatValue(displayValue)}</span>;
}
