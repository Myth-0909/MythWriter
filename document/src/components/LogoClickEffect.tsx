import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface LogoClickEffectProps {
  active: boolean;
  onComplete?: () => void;
}

// Golden brand colors for particles
const PARTICLE_COLORS = ["#E8D39A", "#B9954E", "#C9A85B", "#D4B86A", "#8B7340"];
const RIPPLE_COUNT = 3;
const PARTICLE_COUNT = 16;

export function LogoClickEffect({ active, onComplete }: LogoClickEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rippleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Register GSAP React plugin
  gsap.registerPlugin(useGSAP);

  useGSAP(
    () => {
      if (!active || !containerRef.current) return;

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          onComplete: () => onComplete?.(),
        });

        // 1. Ripple waves — 3 concentric rings expanding outward
        rippleRefs.current.forEach((ripple, i) => {
          if (!ripple) return;

          gsap.fromTo(
            ripple,
            {
              scale: 0.5,
              opacity: 0.8,
              autoAlpha: 0.8,
            },
            {
              scale: 4 + i * 1.5,
              opacity: 0,
              autoAlpha: 0,
              duration: 1.2,
              delay: i * 0.15,
              ease: "power2.out",
            }
          );
        });

        // 2. Particles — 16 small dots scattering in random directions
        particleRefs.current.forEach((particle, i) => {
          if (!particle) return;

          const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
          const distance = 80 + Math.random() * 60;
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];

          // Set particle color
          gsap.set(particle, { backgroundColor: color, boxShadow: `0 0 6px ${color}` });

          tl.fromTo(
            particle,
            {
              x: 0,
              y: 0,
              scale: 0,
              opacity: 1,
              autoAlpha: 1,
            },
            {
              x,
              y,
              scale: 1.2,
              opacity: 0,
              autoAlpha: 0,
              duration: 0.8 + Math.random() * 0.4,
              ease: "power3.out",
            },
            0 // Start at timeline position 0 (parallel with ripples)
          );
        });

        // 3. Glow pulse — background halo
        const glow = containerRef.current?.querySelector("[data-glow]") as HTMLElement | null;
        if (glow) {
          tl.fromTo(
            glow,
            { scale: 0.8, opacity: 0, autoAlpha: 0 },
            {
              scale: 1.5,
              opacity: 0.6,
              autoAlpha: 0.6,
              duration: 0.4,
              ease: "power2.out",
              yoyo: true,
              repeat: 1,
            },
            0
          );
        }
      }, containerRef);

      return () => ctx.revert();
    },
    [active]
  );

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || !active) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {/* Glow pulse */}
      <div
        data-glow
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-brand-400/30 blur-xl"
      />

      {/* Ripple rings */}
      {Array.from({ length: RIPPLE_COUNT }).map((_, i) => (
        <div
          key={`ripple-${i}`}
          ref={(el) => { rippleRefs.current[i] = el; }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full border-2 border-brand-400"
        />
      ))}

      {/* Particles */}
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <div
          key={`particle-${i}`}
          ref={(el) => { particleRefs.current[i] = el; }}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
        />
      ))}
    </div>
  );
}
