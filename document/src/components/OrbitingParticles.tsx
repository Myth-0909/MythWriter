import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface OrbitingParticlesProps {
  count?: number;
  rx?: number;
  ry?: number;
  duration?: number;
  color?: string;
}

export function OrbitingParticles({
  count = 6,
  rx = 64,
  ry = 28,
  duration = 4,
  color = "bg-brand-400/50 dark:bg-brand-300/50",
}: OrbitingParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: reduce)", () => {});
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const particles = particleRefs.current.filter(Boolean) as HTMLDivElement[];
        if (particles.length === 0) return;

        const dummy = { t: 0 };
        gsap.to(dummy, {
          t: Math.PI * 2,
          duration,
          repeat: -1,
          ease: "none",
          onUpdate: () => {
            particles.forEach((p, i) => {
              const phase = (i / count) * Math.PI * 2;
              const angle = dummy.t + phase;
              const px = Math.cos(angle) * rx;
              const py = Math.sin(angle) * ry;
              p.style.transform = `translate3d(${px}px, ${py}px, 0)`;
            });
          },
        });
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-visible"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            particleRefs.current[i] = el;
          }}
          className={`absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full ${color}`}
          style={{
            marginLeft: -3,
            marginTop: -3,
            filter: "blur(0.5px)",
            boxShadow: "0 0 4px currentColor",
          }}
        />
      ))}
    </div>
  );
}
