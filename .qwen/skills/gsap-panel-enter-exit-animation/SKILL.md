---
name: gsap-panel-enter-exit-animation
description: GSAP enter/exit animation pattern for panels/dialogs with proper cleanup using a closing state bridge
source: auto-skill
extracted_at: '2026-05-29T06:30:00.000Z'
---

# GSAP Panel Enter/Exit Animation

When a floating panel, dialog, or overlay needs smooth enter and exit animations that use `transformOrigin` to animate from/to a trigger element's position.

## The Problem

If a component's render is controlled by `{open && <Panel />}`, setting `open = false` immediately unmounts the component, leaving no time for the exit animation to play. The solution is a **`closing` state bridge**: the component stays rendered while the exit animation runs, then unmounts when the animation completes.

## State Setup

```tsx
const [open, setOpen] = useState(false);
const [closing, setClosing] = useState(false);
const closingRef = useRef(false); // Sync ref to avoid stale closures in GSAP callbacks
```

## Animation useEffect

```tsx
useEffect(() => {
  const panel = panelRef.current;
  if (!keyOk || !panel) return;

  // Early return when fully closed and not in closing state
  if (!open && !closing) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ctx = gsap.context(() => {
    const rect = panel.getBoundingClientRect();
    const originX = Math.min(Math.max(triggerX - rect.left, 24), rect.width - 24);
    const originY = Math.min(Math.max(triggerY - rect.top, 24), rect.height - 24);
    const enterItems = panel.querySelectorAll("[data-panel-enter]");

    gsap.set(panel, { transformOrigin: `${originX}px ${originY}px` });

    if (reduceMotion) {
      gsap.set(panel, { autoAlpha: open ? 1 : 0, scale: 1, y: 0, filter: "none" });
      gsap.set(enterItems, { autoAlpha: open ? 1 : 0, y: 0 });
      if (!open) { setClosing(false); setOpen(false); }
      return;
    }

    if (open) {
      // === ENTER ANIMATION ===
      gsap.timeline({ defaults: { ease: "power3.out" } })
        .fromTo(panel,
          { autoAlpha: 0, scale: 0.92, y: 18, filter: "blur(10px)" },
          { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", duration: 0.42, clearProps: "filter,transform,opacity,visibility" }
        )
        .fromTo(enterItems,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out", stagger: 0.055, clearProps: "transform,opacity,visibility" },
          0.08
        );
    } else {
      // === EXIT ANIMATION ===
      gsap.timeline({
        defaults: { ease: "power3.in" },
        onComplete: () => {
          closingRef.current = false;
          setClosing(false);
          setOpen(false);
        },
      })
        .to(enterItems,
          { autoAlpha: 0, y: 8, duration: 0.22, stagger: 0.03, ease: "power2.in" },
          0
        )
        .to(panel,
          { autoAlpha: 0, scale: 0.92, y: 18, filter: "blur(10px)", duration: 0.32 },
          0.06
        );
    }
  }, panel);

  return () => ctx.revert();
}, [keyOk, open, closing, triggerX, triggerY]);
```

## Render Condition

```tsx
{/* Render when open OR closing — keeps panel alive for exit animation */}
{(open || closing) && keyOk && (
  <div ref={panelRef} className="fixed ...">
    <div data-panel-enter>Header</div>
    <div data-panel-enter>Content</div>
    <div data-panel-enter>Footer</div>
  </div>
)}
```

## Close Function

Replace all direct `setOpen(false)` calls with this:

```tsx
const closeWithAnimation = useCallback(() => {
  // Optional: abort ongoing operations, save state, etc.
  abortRef.current?.abort();
  saveData();
  closingRef.current = true;
  setClosing(true);
  // Do NOT call setOpen(false) here — the animation's onComplete handles it
}, [saveData]);
```

## Trigger Button Visibility

If there's a floating button that opens the panel, hide it during `closing` too so it doesn't reappear before the panel finishes animating out:

```tsx
<button className={cn(
  open || closing ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100",
  // ... other classes
)} />
```

## Key Rules

- **`closing` state keeps the component mounted** — the exit animation needs the DOM node to exist
- **`onComplete` is the only place that calls `setOpen(false)`** — never call it in the close trigger
- **Use `closingRef` alongside `closing` state** — GSAP callbacks capture the initial closure; the ref ensures the value is current
- **Exit easing is `power3.in`** (accelerates into the exit), enter easing is `power3.out` (decelerates into the final state)
- **Exit timeline uses `.to()` (forward), enter uses `.fromTo()`** — exit animates from current state to hidden state
- **Stagger exit items first (position 0), then panel fades (position 0.06)** — content disappears before the container shrinks
- **Always use `clearProps` on enter animations** — prevents GSAP inline styles from persisting and breaking subsequent renders
- **`prefers-reduced-motion` must handle both states** — set the correct immediate visibility without animation
- **`transformOrigin` should be calculated from the trigger element's position** — so the panel scales from/to where the user clicked
