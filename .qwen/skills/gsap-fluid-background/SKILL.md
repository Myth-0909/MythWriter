---
name: gsap-fluid-background
description: Create ambient fluid gradient background animations using GSAP with brand-colored floating blobs
source: auto-skill
extracted_at: '2026-05-29T05:25:00.000Z'
---

# GSAP Fluid Background Animation

Create ambient, atmospheric background effects using large blurred gradient blobs that float slowly. Must match project's visual design language.

## Design Rules

- **Use brand colors only**: gold palette (`#E8D39A`, `#B9954E`, `#6E5626`, `#D4B86A`, `#8B7340`) — never generic blues or other colors
- **Keep opacity low**: 0.05–0.12 so blobs don't dominate the page
- **Large blur radius**: 80–140px for smooth gradient feel
- **Slow animation**: 8–17s per cycle for ambient, non-distracting motion
- **Complement backdrop-blur cards**: blobs should produce subtle color shifts behind glassmorphism elements

## Component Structure

```tsx
import { useRef, useState, useEffect } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

const LIGHT_BLOBS = [
  { color: "#E8D39A", size: 600, opacity: 0.12 },
  { color: "#B9954E", size: 400, opacity: 0.08 },
  { color: "#D4B86A", size: 500, opacity: 0.10 },
];

const DARK_BLOBS = [
  { color: "#B9954E", size: 600, opacity: 0.06 },
  { color: "#6E5626", size: 450, opacity: 0.08 },
  { color: "#8B7340", size: 550, opacity: 0.05 },
];

export function FluidBackground({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  // Track dark mode changes via MutationObserver
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const blobs = isDark ? DARK_BLOBS : LIGHT_BLOBS;

  gsap.registerPlugin(useGSAP);

  useGSAP(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      blobRefs.current.forEach((blob, i) => {
        if (!blob) return;
        const { size, opacity } = blobs[i];

        gsap.set(blob, {
          width: size,
          height: size,
          opacity,
          borderRadius: "50%",
          filter: `blur(${80 + i * 20}px)`,
        });

        // Continuous floating animation with yoyo loop
        const duration = 8 + i * 3;
        const xRange = 80 + i * 40;
        const yRange = 60 + i * 30;

        const tl = gsap.timeline({ repeat: -1, yoyo: true });

        tl.to(blob, {
          x: `+=${xRange}`,
          y: `-=${yRange}`,
          scale: 1.1,
          duration: duration * 0.4,
          ease: "sine.inOut",
        }).to(blob, {
          x: `-=${xRange * 0.6}`,
          y: `+=${yRange * 0.8}`,
          scale: 0.95,
          duration: duration * 0.35,
          ease: "sine.inOut",
        }).to(blob, {
          x: `+=${xRange * 0.3}`,
          y: `-=${yRange * 0.5}`,
          scale: 1.05,
          duration: duration * 0.25,
          ease: "sine.inOut",
        });
      });
    }, containerRef);

    return () => ctx.revert();
  }, [blobs]);

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
            left: `${20 + i * 30}%`,
            top: `${15 + i * 25}%`,
          }}
        />
      ))}
    </div>
  );
}
```

## Key Rules

- **Detect theme via MutationObserver** on `document.documentElement` — do NOT require parent to pass `isDark` prop
- **Always use `gsap.context()`** with cleanup return
- **Use `repeat: -1, yoyo: true`** for infinite ambient loops
- **Use relative values** (`+=`, `-=`) for GSAP transforms so each blob drifts from its current position
- **Each blob has different duration/range** so they move independently and don't sync up
- **3 blobs is the sweet spot** — more than 4 starts to look messy
- **Use `sine.inOut` easing** for smooth, organic motion
- **Respect `prefers-reduced-motion`** — render nothing for users who prefer reduced motion
