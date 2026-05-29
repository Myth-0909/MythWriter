import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface AmbientBackgroundProps {
  className?: string;
}

export function AmbientBackground({ className }: AmbientBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scanlineRef = useRef<HTMLDivElement>(null);
  const glowOrbRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);

  gsap.registerPlugin(useGSAP);

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const ctx = gsap.context(() => {
        const masterTl = gsap.timeline({ repeat: -1 });

        // 1. Scanline — slow vertical sweep (AI light feel)
        if (scanlineRef.current) {
          gsap.set(scanlineRef.current, { top: "-10%" });
          masterTl.to(scanlineRef.current, {
            top: "110%",
            duration: 12,
            ease: "none",
            repeat: -1,
          });
        }

        // 2. Glow orb — soft golden light floating slowly
        if (glowOrbRef.current) {
          const orbTl = gsap.timeline({ repeat: -1, yoyo: true });
          orbTl
            .to(glowOrbRef.current, {
              x: "+=120",
              y: "-=80",
              scale: 1.3,
              opacity: 0.4,
              duration: 8,
              ease: "sine.inOut",
            })
            .to(glowOrbRef.current, {
              x: "-=60",
              y: "+=50",
              scale: 0.9,
              opacity: 0.2,
              duration: 6,
              ease: "sine.inOut",
            })
            .to(glowOrbRef.current, {
              x: "-=80",
              y: "+=30",
              scale: 1.1,
              opacity: 0.35,
              duration: 7,
              ease: "sine.inOut",
            });
        }

        // 3. Paper texture — subtle breathing opacity
        if (paperRef.current) {
          gsap.to(paperRef.current, {
            opacity: 0.06,
            duration: 4,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          });
        }

        // 4. Grid lines — very subtle pulse
        if (gridRef.current) {
          gsap.to(gridRef.current, {
            opacity: 0.04,
            duration: 6,
            ease: "sine.inOut",
            repeat: -1,
            yoyo: true,
          });
        }
      }, containerRef);

      return () => ctx.revert();
    },
    []
  );

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return null;

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#FAF8F4] dark:bg-[#0C0F0E] ${className}`}
    >
      {/* Paper texture overlay */}
      <div
        ref={paperRef}
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />

      {/* Subtle grid lines (notebook paper feel) */}
      <div
        ref={gridRef}
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(139,115,64,0.3) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(139,115,64,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {/* AI scanline — soft golden light sweep */}
      <div
        ref={scanlineRef}
        className="absolute left-0 h-[2px] w-full bg-gradient-to-r from-transparent via-brand-400/40 to-transparent"
        style={{
          boxShadow: "0 0 30px 8px rgba(185,149,78,0.15), 0 0 60px 16px rgba(185,149,78,0.05)",
        }}
      />

      {/* Floating glow orb — warm golden light */}
      <div
        ref={glowOrbRef}
        className="absolute left-1/3 top-1/3 h-[300px] w-[300px] rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, rgba(185,149,78,0.35) 0%, rgba(232,211,154,0.15) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
    </div>
  );
}
