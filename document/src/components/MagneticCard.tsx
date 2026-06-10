import { useRef, useCallback } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { cn } from "@/lib/utils";

interface MagneticCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
}

export function MagneticCard({ children, className, intensity = 12 }: MagneticCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const qx = useRef<(v: number) => void>(null);
  const qy = useRef<(v: number) => void>(null);
  const enabled = useRef(true);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {
        enabled.current = false;
      });
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        enabled.current = true;
      });

      qx.current = gsap.quickTo(cardRef.current, "rotationY", {
        duration: 0.9,
        ease: "power3.out",
      });
      qy.current = gsap.quickTo(cardRef.current, "rotationX", {
        duration: 0.9,
        ease: "power3.out",
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || !enabled.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rx = (e.clientY - rect.top) / rect.height - 0.5;
      const ry = (e.clientX - rect.left) / rect.width - 0.5;
      qx.current?.(-rx * intensity);
      qy.current?.(ry * intensity);
    },
    [intensity]
  );

  const handleMouseLeave = useCallback(() => {
    qx.current?.(0);
    qy.current?.(0);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(className)}
      style={{ perspective: "1000px" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={cardRef}
        className="w-full"
        style={{
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
