import { useRef, useState, useEffect } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface FluidBackgroundProps {
  className?: string;
}

// Light mode gradient blobs — larger, more visible
const LIGHT_BLOBS = [
  { color: "#E8D39A", size: 800, opacity: 0.25, startX: "10%", startY: "20%" },
  { color: "#B9954E", size: 600, opacity: 0.20, startX: "70%", startY: "60%" },
  { color: "#D4B86A", size: 700, opacity: 0.22, startX: "40%", startY: "80%" },
  { color: "#C9A85B", size: 500, opacity: 0.18, startX: "80%", startY: "15%" },
];

// Dark mode gradient blobs — more visible in dark
const DARK_BLOBS = [
  { color: "#B9954E", size: 800, opacity: 0.15, startX: "15%", startY: "30%" },
  { color: "#6E5626", size: 700, opacity: 0.18, startX: "60%", startY: "70%" },
  { color: "#8B7340", size: 600, opacity: 0.12, startX: "30%", startY: "10%" },
  { color: "#D4B86A", size: 550, opacity: 0.10, startX: "75%", startY: "40%" },
];

export function FluidBackground({ className }: FluidBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  // Track dark mode changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const blobs = isDark ? DARK_BLOBS : LIGHT_BLOBS;

  gsap.registerPlugin(useGSAP);

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const ctx = gsap.context(() => {
        blobRefs.current.forEach((blob, i) => {
          if (!blob) return;

          const { size, opacity } = blobs[i];

          // Set initial state
          gsap.set(blob, {
            width: size,
            height: size,
            opacity,
            borderRadius: "50%",
            filter: `blur(${100 + i * 30}px)`,
            x: 0,
            y: 0,
          });

          // Create continuous floating animation with larger movement
          const duration = 6 + i * 2;
          const xRange = 200 + i * 50;  // Much larger movement
          const yRange = 150 + i * 40;

          const tl = gsap.timeline({ repeat: -1, yoyo: true });

          tl.to(blob, {
            x: `+=${xRange}`,
            y: `-=${yRange}`,
            scale: 1.2,
            duration: duration * 0.35,
            ease: "sine.inOut",
          }).to(blob, {
            x: `-=${xRange * 0.7}`,
            y: `+=${yRange * 0.9}`,
            scale: 0.9,
            duration: duration * 0.3,
            ease: "sine.inOut",
          }).to(blob, {
            x: `+=${xRange * 0.4}`,
            y: `-=${yRange * 0.6}`,
            scale: 1.1,
            duration: duration * 0.35,
            ease: "sine.inOut",
          });
        });
      }, containerRef);

      return () => ctx.revert();
    },
    [blobs]
  );

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return null;

  return (
    <div ref={containerRef} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {blobs.map((blob, i) => (
        <div
          key={i}
          ref={(el) => { blobRefs.current[i] = el; }}
          className="absolute"
          style={{
            backgroundColor: blob.color,
            left: blob.startX,
            top: blob.startY,
          }}
        />
      ))}
    </div>
  );
}
