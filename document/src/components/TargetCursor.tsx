import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TargetCursorProps {
  className?: string;
  targetSelector?: string;
  theme?: "light" | "dark";
}

export function TargetCursor({
  className,
  targetSelector = "button, input, textarea, a, [role='button'], [data-target-cursor]",
  theme = "dark",
}: TargetCursorProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const centerDotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    const centerDot = centerDotRef.current;
    if (!cursor) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    let frame = 0;
    const current = { x: window.innerWidth / 2, y: window.innerHeight / 2, width: 30, height: 30, opacity: 0, dotOpacity: 0 };
    const target = { ...current };

    const setTargetFromPoint = (x: number, y: number) => {
      const element = document.elementFromPoint(x, y);
      const targetElement = element?.closest(targetSelector) as HTMLElement | null;
      const isDisabled =
        targetElement instanceof HTMLButtonElement || targetElement instanceof HTMLInputElement || targetElement instanceof HTMLTextAreaElement
          ? targetElement.disabled
          : false;

      if (targetElement && !isDisabled && !cursor.contains(targetElement)) {
        const rect = targetElement.getBoundingClientRect();
        target.x = rect.left + rect.width / 2;
        target.y = rect.top + rect.height / 2;
        target.width = Math.max(34, rect.width + 14);
        target.height = Math.max(34, rect.height + 14);
        target.opacity = 1;
        target.dotOpacity = 0;
        return;
      }

      target.x = x;
      target.y = y;
      target.width = 30;
      target.height = 30;
      target.opacity = 0.72;
      target.dotOpacity = targetElement && !cursor.contains(targetElement) ? 0 : 1;
    };

    const animate = () => {
      current.x += (target.x - current.x) * 0.22;
      current.y += (target.y - current.y) * 0.22;
      current.width += (target.width - current.width) * 0.18;
      current.height += (target.height - current.height) * 0.18;
      current.opacity += (target.opacity - current.opacity) * 0.18;
      current.dotOpacity += (target.dotOpacity - current.dotOpacity) * 0.2;

      cursor.style.width = `${current.width}px`;
      cursor.style.height = `${current.height}px`;
      cursor.style.opacity = `${current.opacity}`;
      cursor.style.transform = `translate3d(${current.x - current.width / 2}px, ${current.y - current.height / 2}px, 0)`;
      if (centerDot) {
        centerDot.style.opacity = `${current.dotOpacity}`;
      }

      frame = window.requestAnimationFrame(animate);
    };

    const onPointerMove = (event: PointerEvent) => {
      setTargetFromPoint(event.clientX, event.clientY);
    };

    const onPointerLeave = () => {
      target.opacity = 0;
      target.dotOpacity = 0;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.cancelAnimationFrame(frame);
    };
  }, [targetSelector]);

  return (
    <div
      ref={cursorRef}
      className={cn(
        "pointer-events-none fixed left-0 top-0 z-[70] hidden will-change-transform md:block",
        theme === "dark" ? "mix-blend-screen" : "mix-blend-normal",
        className
      )}
      style={{ opacity: 0 }}
      aria-hidden="true"
    >
      <span
        className={cn(
          "absolute left-0 top-0 h-3 w-3 border-l border-t",
          theme === "dark"
            ? "border-cyan-100/90 shadow-[0_0_14px_rgba(141,215,255,0.65)]"
            : "border-[#0a3552] shadow-[0_0_0_1px_rgba(10,53,82,0.18),0_8px_18px_rgba(10,53,82,0.22)]"
        )}
      />
      <span
        className={cn(
          "absolute right-0 top-0 h-3 w-3 border-r border-t",
          theme === "dark"
            ? "border-cyan-100/90 shadow-[0_0_14px_rgba(141,215,255,0.65)]"
            : "border-[#0a3552] shadow-[0_0_0_1px_rgba(10,53,82,0.18),0_8px_18px_rgba(10,53,82,0.22)]"
        )}
      />
      <span
        className={cn(
          "absolute bottom-0 left-0 h-3 w-3 border-b border-l",
          theme === "dark"
            ? "border-amber-200/90 shadow-[0_0_14px_rgba(246,184,61,0.55)]"
            : "border-[#b46c08] shadow-[0_0_0_1px_rgba(180,108,8,0.2),0_8px_18px_rgba(180,108,8,0.2)]"
        )}
      />
      <span
        className={cn(
          "absolute bottom-0 right-0 h-3 w-3 border-b border-r",
          theme === "dark"
            ? "border-amber-200/90 shadow-[0_0_14px_rgba(246,184,61,0.55)]"
            : "border-[#b46c08] shadow-[0_0_0_1px_rgba(180,108,8,0.2),0_8px_18px_rgba(180,108,8,0.2)]"
        )}
      />
      <span
        ref={centerDotRef}
        className={cn(
          "absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
          theme === "dark"
            ? "bg-white/80 shadow-[0_0_12px_rgba(255,255,255,0.75)]"
            : "bg-[#0a3552] shadow-[0_0_0_3px_rgba(10,53,82,0.12)]"
        )}
        style={{ opacity: 0 }}
      />
    </div>
  );
}
