import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface SplitTextProps {
  text: string;
  color: string;
  className?: string;
  splitBy?: "characters" | "words";
  direction?: "up" | "down";
  staggerDelay?: number;
  duration?: number;
}

export function SplitText({
  text,
  color,
  className,
  splitBy = "characters",
  direction = "up",
  staggerDelay = 24,
  duration = 760,
}: SplitTextProps) {
  const tokens = useMemo(() => {
    if (splitBy === "words") return text.split(/(\s+)/).filter(Boolean);
    return Array.from(text);
  }, [splitBy, text]);

  const distance = direction === "up" ? "0.72em" : "-0.72em";
  const angle = direction === "up" ? "14deg" : "-14deg";

  return (
    <span aria-label={text} className={cn("inline-block", className)}>
      <style>{`
        @keyframes split-text-reveal {
          0% {
            opacity: 0;
            filter: blur(9px);
            transform: translate3d(0, var(--split-distance), 0) rotateX(var(--split-angle));
          }
          100% {
            opacity: 1;
            filter: blur(0);
            transform: translate3d(0, 0, 0) rotateX(0deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .split-text-token {
            animation: none !important;
            opacity: 1 !important;
            filter: none !important;
            transform: none !important;
          }
        }
      `}</style>
      {tokens.map((token, index) => {
        if (/^\s+$/.test(token)) {
          return (
            <span key={`${token}-${index}`} aria-hidden="true" className="whitespace-pre">
              {token}
            </span>
          );
        }

        return (
          <span
            key={`${token}-${index}`}
            aria-hidden="true"
            className="split-text-token inline-block will-change-transform"
            style={
              {
                "--split-distance": distance,
                "--split-angle": angle,
                animation: `split-text-reveal ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${index * staggerDelay}ms both`,
                color,
              } as CSSProperties
            }
          >
            {token}
          </span>
        );
      })}
    </span>
  );
}
