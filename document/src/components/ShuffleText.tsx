import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

interface ShuffleTextProps {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  characters?: string;
}

const defaultCharacters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function ShuffleText({
  text,
  className,
  speed = 70,
  delay = 420,
  characters = defaultCharacters,
}: ShuffleTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const stableChars = useMemo(() => characters.split(""), [characters]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      setDisplayText(text);
      return;
    }

    let frame = 0;
    let intervalId = 0;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setDisplayText(
          text
            .split("")
            .map((char, index) => {
              if (char.trim() === "") return char;
              if (index < frame) return char;
              return stableChars[Math.floor(Math.random() * stableChars.length)] || char;
            })
            .join("")
        );

        frame += 1;
        if (frame > text.length) {
          window.clearInterval(intervalId);
          setDisplayText(text);
        }
      }, speed);
    }, delay);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [delay, speed, stableChars, text]);

  return (
    <span className={cn("inline-block font-mono tabular-nums", className)} aria-label={text}>
      {displayText}
    </span>
  );
}
