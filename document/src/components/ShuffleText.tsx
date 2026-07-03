import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type ShuffleDirection = "left" | "right" | "up" | "down";
type AnimationMode = "evenodd" | "random";

interface ShuffleTextProps {
  text: string;
  className?: string;
  shuffleDirection?: ShuffleDirection;
  duration?: number;
  delay?: number;
  shuffleTimes?: number;
  stagger?: number;
  maxDelay?: number;
  animationMode?: AnimationMode;
  scrambleCharset?: string;
  triggerOnHover?: boolean;
}

const defaultCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomChar(charset: string) {
  return charset.charAt(Math.floor(Math.random() * charset.length)) || "";
}

function getDelay(index: number, mode: AnimationMode, stagger: number, maxDelay: number) {
  if (mode === "random") return Math.random() * maxDelay;
  const groupIndex = Math.floor(index / 2);
  const groupOffset = index % 2 === 0 ? 0.18 : 0;
  return groupOffset + groupIndex * stagger;
}

export function ShuffleText({
  text,
  className,
  shuffleDirection = "right",
  duration = 0.8,
  delay = 500,
  shuffleTimes = 2,
  stagger = 0.05,
  maxDelay = 0.6,
  animationMode = "evenodd",
  scrambleCharset = defaultCharset,
  triggerOnHover = true,
}: ShuffleTextProps) {
  const [active, setActive] = useState(false);
  const [cycle, setCycle] = useState(0);
  const chars = useMemo(() => text.split(""), [text]);
  const rolls = Math.max(1, Math.floor(shuffleTimes));
  const isVertical = shuffleDirection === "up" || shuffleDirection === "down";

  const strips = useMemo(
    () =>
      chars.map((char) => {
        if (char.trim() === "") return [char];
        const scrambles = Array.from({ length: rolls }, () => randomChar(scrambleCharset));
        return shuffleDirection === "left" || shuffleDirection === "up"
          ? [...scrambles, char]
          : [char, ...scrambles];
      }),
    [chars, cycle, rolls, scrambleCharset, shuffleDirection]
  );

  const play = () => {
    setActive(false);
    setCycle((value) => value + 1);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setActive(true));
    });
  };

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      setActive(true);
      return;
    }

    const timeoutId = window.setTimeout(play, delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, text]);

  return (
    <span
      className={cn("inline-flex flex-wrap items-baseline leading-none", className)}
      aria-label={text}
      onMouseEnter={triggerOnHover ? play : undefined}
    >
      {chars.map((char, index) => {
        if (char.trim() === "") {
          return (
            <span key={`${cycle}-${index}-space`} aria-hidden="true">
              {char}
            </span>
          );
        }

        const items = strips[index];
        const transitionDelay = getDelay(index, animationMode, stagger, maxDelay);
        const start = shuffleDirection === "left" || shuffleDirection === "up" ? 0 : -rolls * 100;
        const end = shuffleDirection === "left" || shuffleDirection === "up" ? -rolls * 100 : 0;
        const transform = isVertical
          ? `translate3d(0, ${active ? end : start}%, 0)`
          : `translate3d(${active ? end : start}%, 0, 0)`;
        const style = {
          transform,
          transitionDelay: `${transitionDelay}s`,
          transitionDuration: `${duration}s`,
        } satisfies CSSProperties;

        return (
          <span
            key={`${cycle}-${index}-${char}`}
            className={cn(
              "inline-block overflow-hidden align-bottom",
              isVertical ? "h-[1em]" : "w-[1ch]"
            )}
            aria-hidden="true"
          >
            <span
              className={cn(
                "will-change-transform [transition-property:transform] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]",
                isVertical ? "flex flex-col" : "inline-flex"
              )}
              style={style}
            >
              {items.map((item, itemIndex) => (
                <span
                  key={`${item}-${itemIndex}`}
                  className={cn(
                    "inline-block text-center leading-none",
                    isVertical ? "h-[1em]" : "w-[1ch]"
                  )}
                >
                  {item}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
