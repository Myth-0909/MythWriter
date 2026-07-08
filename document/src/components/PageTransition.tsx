import { useEffect, useState, useRef, type CSSProperties, type ReactNode } from "react";
import { getPageTransitionProfile } from "@/lib/displayExperience";

interface PageTransitionProps {
  children: ReactNode;
  pageKey: string;
}

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  const [animKey, setAnimKey] = useState(0);
  const prevKeyRef = useRef(pageKey);
  const profile = getPageTransitionProfile(pageKey);

  useEffect(() => {
    if (pageKey !== prevKeyRef.current) {
      prevKeyRef.current = pageKey;
      setAnimKey((k) => k + 1);
    }
  }, [pageKey]);

  return (
    <div
      key={animKey}
      className={`page-transition-shell ${profile.className}`}
      style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        animation: `pageEnter ${profile.durationMs}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        "--page-enter-y": profile.y,
        "--page-enter-scale": profile.scale,
        "--page-enter-blur": profile.blur,
      } as CSSProperties}
    >
      {children}
    </div>
  );
}
