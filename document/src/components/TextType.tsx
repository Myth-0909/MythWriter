import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementType,
  type HTMLAttributes,
} from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";
import "./TextType.css";

interface TextTypeProps extends HTMLAttributes<HTMLElement> {
  text: string | string[];
  as?: ElementType;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  hideCursorOnComplete?: boolean;
  cursorCharacter?: string;
  cursorClassName?: string;
  cursorBlinkDuration?: number;
  textColors?: string[];
  variableSpeed?: {
    min: number;
    max: number;
  };
  onSentenceComplete?: (text: string, index: number) => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
}

export function TextType({
  text,
  as: Component = "span",
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className,
  showCursor = true,
  hideCursorWhileTyping = false,
  hideCursorOnComplete = false,
  cursorCharacter = "|",
  cursorClassName,
  cursorBlinkDuration = 0.5,
  textColors = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible = false,
  reverseMode = false,
  style,
  ...props
}: TextTypeProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLElement>(null);

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);
  const currentText = textArray[currentTextIndex] ?? "";
  const processedText = reverseMode ? Array.from(currentText).reverse().join("") : currentText;

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    const { min, max } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [typingSpeed, variableSpeed]);

  const getCurrentTextColor = () => {
    if (textColors.length === 0) return "inherit";
    return textColors[currentTextIndex % textColors.length];
  };

  useEffect(() => {
    setDisplayedText("");
    setCurrentCharIndex(0);
    setIsDeleting(false);
    setCurrentTextIndex(0);
    setIsVisible(!startOnVisible);
    setHasStarted(false);
    setIsComplete(false);
  }, [startOnVisible, textArray]);

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    gsap.set(cursorRef.current, { opacity: 1 });
    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });

    return () => {
      tween.kill();
    };
  }, [cursorBlinkDuration, showCursor]);

  useEffect(() => {
    if (!isVisible || isComplete) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      setDisplayedText(processedText);
      setCurrentCharIndex(Array.from(processedText).length);
      setHasStarted(true);
      setIsComplete(true);
      return;
    }

    let timeout: number | undefined;
    const isWaitingToStart = currentCharIndex === 0 && !isDeleting && displayedText === "";

    const runTypingStep = () => {
      setHasStarted(true);

      if (isDeleting) {
        if (displayedText === "") {
          setIsDeleting(false);
          onSentenceComplete?.(currentText, currentTextIndex);
          setCurrentTextIndex((previous) => (previous + 1) % textArray.length);
          setCurrentCharIndex(0);
          return;
        }

        setDisplayedText((previous) => previous.slice(0, -1));
        return;
      }

      if (currentCharIndex < processedText.length) {
        setDisplayedText((previous) => previous + processedText[currentCharIndex]);
        setCurrentCharIndex((previous) => previous + 1);
        return;
      }

      if (!loop && currentTextIndex === textArray.length - 1) {
        setIsComplete(true);
        onSentenceComplete?.(currentText, currentTextIndex);
        return;
      }

      timeout = window.setTimeout(() => {
        setIsDeleting(true);
      }, pauseDuration);
    };

    const stepDelay = isWaitingToStart
      ? initialDelay
      : isDeleting
        ? deletingSpeed
        : variableSpeed
          ? getRandomSpeed()
          : typingSpeed;

    timeout = window.setTimeout(runTypingStep, stepDelay);
    return () => {
      if (timeout) window.clearTimeout(timeout);
    };
  }, [
    currentCharIndex,
    currentText,
    currentTextIndex,
    deletingSpeed,
    displayedText,
    getRandomSpeed,
    initialDelay,
    isComplete,
    isDeleting,
    isVisible,
    loop,
    onSentenceComplete,
    pauseDuration,
    processedText,
    textArray.length,
    typingSpeed,
    variableSpeed,
  ]);

  const shouldHideCursor =
    !hasStarted ||
    (hideCursorWhileTyping && (currentCharIndex < processedText.length || isDeleting)) ||
    (hideCursorOnComplete && isComplete);
  const cursorClassNames = [
    "text-type__cursor",
    cursorClassName,
    shouldHideCursor ? "text-type__cursor--hidden" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const accessibleText = textArray.join(" ");

  return createElement(
    Component,
    {
      ...props,
      ref: containerRef,
      className: cn("text-type", className),
      style,
      "aria-label": props["aria-label"] ?? accessibleText,
    },
    <span className="text-type__content" style={{ color: getCurrentTextColor() }} aria-hidden="true">
      {displayedText}
    </span>,
    showCursor && (
      <span
        ref={cursorRef}
        className={cursorClassNames}
        aria-hidden="true"
      >
        {cursorCharacter}
      </span>
    )
  );
}
