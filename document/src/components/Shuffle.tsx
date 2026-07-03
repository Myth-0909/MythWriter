import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { SplitText as GSAPSplitText } from "gsap/SplitText";
import { cn } from "@/lib/utils";

type ShuffleDirection = "left" | "right" | "up" | "down";
type AnimationMode = "evenodd" | "random";

interface ShuffleProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  shuffleDirection?: ShuffleDirection;
  duration?: number;
  maxDelay?: number;
  ease?: string;
  shuffleTimes?: number;
  animationMode?: AnimationMode;
  loop?: boolean;
  loopDelay?: number;
  stagger?: number;
  scrambleCharset?: string;
  triggerOnHover?: boolean;
  respectReducedMotion?: boolean;
}

gsap.registerPlugin(GSAPSplitText);

const defaultCharset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomFrom(charset: string) {
  return charset.charAt(Math.floor(Math.random() * charset.length)) || "";
}

export default function Shuffle({
  text,
  className,
  style,
  shuffleDirection = "right",
  duration = 0.35,
  maxDelay = 0,
  ease = "power3.out",
  shuffleTimes = 1,
  animationMode = "evenodd",
  loop = false,
  loopDelay = 0,
  stagger = 0.03,
  scrambleCharset = defaultCharset,
  triggerOnHover = true,
  respectReducedMotion = true,
}: ShuffleProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const splitRef = useRef<any>(null);
  const wrappersRef = useRef<HTMLElement[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const playingRef = useRef(false);

  const isVertical = shuffleDirection === "up" || shuffleDirection === "down";
  const classNames = useMemo(
    () => cn("inline-block whitespace-nowrap leading-none", className),
    [className]
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || !text) return;

    const reduceMotion =
      respectReducedMotion &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) return;

    const teardown = () => {
      timelineRef.current?.kill();
      timelineRef.current = null;

      wrappersRef.current.forEach((wrap) => {
        const inner = wrap.firstElementChild;
        const original = inner?.querySelector("[data-orig='1']");
        if (original && wrap.parentNode) {
          wrap.parentNode.replaceChild(original, wrap);
        }
      });
      wrappersRef.current = [];

      try {
        splitRef.current?.revert();
      } catch {
        /* noop */
      }
      splitRef.current = null;
      playingRef.current = false;
    };

    const build = () => {
      teardown();

      splitRef.current = new GSAPSplitText(node, {
        type: "chars",
        charsClass: "shuffle-char",
        wordsClass: "shuffle-word",
        linesClass: "shuffle-line",
        reduceWhiteSpace: false,
      });

      const chars = (splitRef.current.chars || []) as HTMLElement[];
      const rolls = Math.max(1, Math.floor(shuffleTimes));

      chars.forEach((char) => {
        const parent = char.parentElement;
        if (!parent) return;

        const rect = char.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        if (!width || !height) return;

        const wrapper = document.createElement("span");
        Object.assign(wrapper.style, {
          display: "inline-block",
          overflow: "hidden",
          width: `${width}px`,
          height: isVertical ? `${height}px` : "auto",
          verticalAlign: "bottom",
        });

        const strip = document.createElement("span");
        Object.assign(strip.style, {
          display: isVertical ? "flex" : "inline-flex",
          flexDirection: isVertical ? "column" : "row",
          whiteSpace: "nowrap",
          willChange: "transform",
        });

        parent.insertBefore(wrapper, char);
        wrapper.appendChild(strip);

        const first = char.cloneNode(true) as HTMLElement;
        Object.assign(first.style, {
          display: isVertical ? "block" : "inline-block",
          width: `${width}px`,
          height: isVertical ? `${height}px` : "auto",
          textAlign: "center",
          lineHeight: "1",
        });

        char.setAttribute("data-orig", "1");
        Object.assign(char.style, {
          display: isVertical ? "block" : "inline-block",
          width: `${width}px`,
          height: isVertical ? `${height}px` : "auto",
          textAlign: "center",
          lineHeight: "1",
        });

        strip.appendChild(first);
        for (let index = 0; index < rolls; index += 1) {
          const scramble = char.cloneNode(true) as HTMLElement;
          scramble.textContent = randomFrom(scrambleCharset);
          Object.assign(scramble.style, {
            display: isVertical ? "block" : "inline-block",
            width: `${width}px`,
            height: isVertical ? `${height}px` : "auto",
            textAlign: "center",
            lineHeight: "1",
          });
          strip.appendChild(scramble);
        }
        strip.appendChild(char);

        const steps = rolls + 1;
        if (shuffleDirection === "right" || shuffleDirection === "down") {
          const firstCopy = strip.firstElementChild;
          const real = strip.lastElementChild;
          if (real) strip.insertBefore(real, strip.firstChild);
          if (firstCopy) strip.appendChild(firstCopy);
        }

        const startX = shuffleDirection === "right" ? -steps * width : 0;
        const finalX = shuffleDirection === "left" ? -steps * width : 0;
        const startY = shuffleDirection === "down" ? -steps * height : 0;
        const finalY = shuffleDirection === "up" ? -steps * height : 0;

        gsap.set(strip, { x: startX, y: startY, force3D: true });
        strip.setAttribute("data-final-x", String(finalX));
        strip.setAttribute("data-final-y", String(finalY));

        wrappersRef.current.push(wrapper);
      });
    };

    const randomizeScrambles = () => {
      wrappersRef.current.forEach((wrapper) => {
        const strip = wrapper.firstElementChild;
        if (!strip) return;
        const children = Array.from(strip.children);
        for (let index = 1; index < children.length - 1; index += 1) {
          children[index].textContent = randomFrom(scrambleCharset);
        }
      });
    };

    const play = () => {
      const strips = wrappersRef.current
        .map((wrapper) => wrapper.firstElementChild as HTMLElement | null)
        .filter(Boolean) as HTMLElement[];
      if (!strips.length) return;

      playingRef.current = true;
      timelineRef.current?.kill();

      const timeline = gsap.timeline({
        smoothChildTiming: true,
        repeat: loop ? -1 : 0,
        repeatDelay: loop ? loopDelay : 0,
        onRepeat: randomizeScrambles,
        onComplete: () => {
          playingRef.current = false;
        },
      });

      const addTween = (targets: HTMLElement[], at: number) => {
        timeline.to(
          targets,
          {
            duration,
            ease,
            force3D: true,
            stagger: animationMode === "evenodd" ? stagger : 0,
            x: (_index, target) => Number(target.getAttribute("data-final-x") || 0),
            y: (_index, target) => Number(target.getAttribute("data-final-y") || 0),
          },
          at
        );
      };

      if (animationMode === "evenodd") {
        const odd = strips.filter((_, index) => index % 2 === 1);
        const even = strips.filter((_, index) => index % 2 === 0);
        const oddTotal = duration + Math.max(0, odd.length - 1) * stagger;
        if (odd.length) addTween(odd, 0);
        if (even.length) addTween(even, odd.length ? oddTotal * 0.7 : 0);
      } else {
        strips.forEach((strip) => addTween([strip], Math.random() * maxDelay));
      }

      timelineRef.current = timeline;
    };

    const run = () => {
      build();
      randomizeScrambles();
      play();
    };

    const handleHover = () => {
      if (playingRef.current) return;
      run();
    };

    const start = () => {
      run();
      if (triggerOnHover) node.addEventListener("mouseenter", handleHover);
    };

    if ("fonts" in document) {
      document.fonts.ready.then(start);
    } else {
      start();
    }

    return () => {
      node.removeEventListener("mouseenter", handleHover);
      teardown();
    };
  }, [
    animationMode,
    duration,
    ease,
    isVertical,
    loop,
    loopDelay,
    maxDelay,
    respectReducedMotion,
    scrambleCharset,
    shuffleDirection,
    shuffleTimes,
    stagger,
    text,
    triggerOnHover,
  ]);

  return (
    <span ref={ref} className={classNames} style={style}>
      {text}
    </span>
  );
}
