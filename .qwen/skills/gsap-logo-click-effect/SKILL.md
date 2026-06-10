---
name: gsap-logo-click-effect
description: Create GSAP-powered click effects on UI elements with layered animations (ripples, particles, glow)
source: auto-skill
extracted_at: '2026-05-29T05:10:49.882Z'
---

# GSAP Logo/Element Click Effect

When a UI element (logo, button, icon) needs a polished click effect with multiple layered animations.

## Setup

Install dependencies:
```bash
pnpm add gsap @gsap/react
```

## Component Structure

Create a dedicated effect component that renders only when `active` is true:

```tsx
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

interface ClickEffectProps {
  active: boolean;
  onComplete?: () => void;
}

export function ClickEffect({ active, onComplete }: ClickEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rippleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const particleRefs = useRef<(HTMLDivElement | null)[]>([]);

  gsap.registerPlugin(useGSAP);

  useGSAP(() => {
    if (!active || !containerRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ onComplete: () => onComplete?.() });

      // Layer 1: Ripple rings
      // Layer 2: Particles
      // Layer 3: Glow pulse

      tl.to(/* ... */);
    }, containerRef);

    return () => ctx.revert();
  }, [active]);

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || !active) return null;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {/* Effect elements */}
    </div>
  );
}
```

## Layered Animation Pattern

### 1. Ripple Rings (expanding concentric circles)

```tsx
{Array.from({ length: 3 }).map((_, i) => (
  <div
    key={`ripple-${i}`}
    ref={(el) => { rippleRefs.current[i] = el; }}
    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full border-2 border-brand-400"
  />
))}

// Animation
rippleRefs.current.forEach((ripple, i) => {
  if (!ripple) return;
  gsap.fromTo(ripple,
    { scale: 0.5, opacity: 0.8, autoAlpha: 0.8 },
    { scale: 4 + i * 1.5, opacity: 0, autoAlpha: 0, duration: 1.2, delay: i * 0.15, ease: "power2.out" }
  );
});
```

### 2. Particle Burst (dots scattering outward)

```tsx
{Array.from({ length: 16 }).map((_, i) => (
  <div
    key={`particle-${i}`}
    ref={(el) => { particleRefs.current[i] = el; }}
    className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
  />
))}

// Animation
particleRefs.current.forEach((particle, i) => {
  if (!particle) return;
  const angle = (i / count) * Math.PI * 2;
  const distance = 80 + Math.random() * 60;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;

  gsap.set(particle, { backgroundColor: color, boxShadow: `0 0 6px ${color}` });
  tl.fromTo(particle,
    { x: 0, y: 0, scale: 0, opacity: 1, autoAlpha: 1 },
    { x, y, scale: 1.2, opacity: 0, autoAlpha: 0, duration: 0.8 + Math.random() * 0.4, ease: "power3.out" },
    0  // Start at timeline position 0 (parallel with other layers)
  );
});
```

### 3. Glow Pulse (background halo)

```tsx
const glow = containerRef.current?.querySelector("[data-glow]") as HTMLElement | null;
if (glow) {
  tl.fromTo(glow,
    { scale: 0.8, opacity: 0, autoAlpha: 0 },
    { scale: 1.5, opacity: 0.6, autoAlpha: 0.6, duration: 0.4, ease: "power2.out", yoyo: true, repeat: 1 },
    0
  );
}
```

## Integration Pattern

In the parent component:

```tsx
const [effectActive, setEffectActive] = useState(false);

const handleClick = () => {
  if (!effectActive) {
    setEffectActive(true);
    // Effect resets itself via onComplete
  }
};

return (
  <div className="relative">
    <button onClick={handleClick}>
      {/* Target element */}
    </button>
    <ClickEffect active={effectActive} onComplete={() => setEffectActive(false)} />
  </div>
);
```

## Key Rules

- **Always use `gsap.context()`** and return `ctx.revert()` for cleanup (required for React 18 strict mode)
- **Use `autoAlpha` instead of `opacity`** — GSAP sets `visibility: hidden` at 0, preventing invisible elements from blocking clicks
- **Use transform aliases** (`scale`, `x`, `y`) — never animate `transform` string directly
- **Start all layers at timeline position 0** (`tl.to(..., 0)`) so they run in parallel
- **Debounce trigger** — check `!effectActive` before setting true to prevent rapid re-triggers
- **Respect `prefers-reduced-motion`** — return null early if user prefers reduced motion
- **Position with `pointer-events-none`** — effect overlay must not block interaction with underlying elements
- **Optional chaining for DOM queries** — `containerRef.current?.querySelector()` to avoid null errors in TypeScript
