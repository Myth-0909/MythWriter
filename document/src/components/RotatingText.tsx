import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface RotatingTextProps {
  texts: string[];
  color: string;
  shineColor: string;
  className?: string;
  splitBy?: "characters" | "words";
  rotationInterval?: number;
  staggerDelay?: number;
  direction?: "up" | "down";
}

export function RotatingText({
  texts,
  color,
  shineColor,
  className,
  splitBy = "words",
  rotationInterval = 5200,
  staggerDelay = 28,
  direction = "up",
}: RotatingTextProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeText = texts[activeIndex] ?? "";
  const textKey = texts.join("\u0001");

  useEffect(() => {
    setActiveIndex(0);
  }, [textKey]);

  useEffect(() => {
    if (texts.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % texts.length);
    }, rotationInterval);

    return () => window.clearInterval(interval);
  }, [rotationInterval, textKey, texts]);

  const tokens = useMemo(() => {
    if (splitBy === "characters") return Array.from(activeText);
    return activeText.split(/(\s+)/).filter(Boolean);
  }, [activeText, splitBy]);

  const distance = direction === "up" ? "0.72em" : "-0.72em";
  const angle = direction === "up" ? "18deg" : "-18deg";

  return (
    <span aria-label={activeText} className={cn("inline-block", className)}>
      <style>{`
        @keyframes rotating-text-enter {
          0% {
            opacity: 0;
            filter: blur(9px);
            transform: translate3d(0, var(--rt-distance), 0) rotateX(var(--rt-angle));
          }
          100% {
            opacity: 1;
            filter: blur(0);
            transform: translate3d(0, 0, 0) rotateX(0deg);
          }
        }
        @keyframes rotating-text-shine {
          0% { background-position: 160% 50%; }
          100% { background-position: -90% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rotating-text-token {
            animation: none !important;
            opacity: 1 !important;
            filter: none !important;
            transform: none !important;
          }
        }
      `}</style>
      <span key={`${activeIndex}-${activeText}`} className="inline-block">
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
              className="rotating-text-token inline-block bg-clip-text text-transparent will-change-transform"
              style={
                {
                  "--rt-distance": distance,
                  "--rt-angle": angle,
                  animation: `rotating-text-enter 760ms cubic-bezier(0.22, 1, 0.36, 1) ${index * staggerDelay}ms both, rotating-text-shine 7.5s linear ${index * staggerDelay + 520}ms infinite`,
                  backgroundImage: `linear-gradient(108deg, ${color} 0%, ${color} 34%, ${shineColor} 50%, ${color} 66%, ${color} 100%)`,
                  backgroundSize: "220% 100%",
                } as CSSProperties
              }
            >
              {token}
            </span>
          );
        })}
      </span>
    </span>
  );
}
