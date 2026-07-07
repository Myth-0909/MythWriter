import { useEffect, useState, useRef, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
  pageKey: string;
}

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  const [animKey, setAnimKey] = useState(0);
  const prevKeyRef = useRef(pageKey);

  useEffect(() => {
    if (pageKey !== prevKeyRef.current) {
      prevKeyRef.current = pageKey;
      setAnimKey((k) => k + 1);
    }
  }, [pageKey]);

  return (
    <div
      key={animKey}
      className="page-transition-shell"
      style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        animation: "pageEnter 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      {children}
    </div>
  );
}
