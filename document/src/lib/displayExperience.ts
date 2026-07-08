export type CreativeLoaderVariant = "manuscript" | "ai" | "cursor" | "dots";

export type LoadingTone = "document" | "ai" | "quiet" | "settings" | "brain";

export type LoadingPresentation = {
  variant: CreativeLoaderVariant;
  overlayClassName: string;
  accentClassName: string;
};

export type PageTransitionProfile = {
  className: string;
  durationMs: number;
  y: string;
  scale: string;
  blur: string;
};

export type WorkbenchLayoutClasses = {
  shell: string;
  hero: string;
};

const WORKBENCH_LAYOUT_CLASSES: WorkbenchLayoutClasses = {
  shell:
    "grid gap-5 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] min-[1440px]:grid-cols-[minmax(0,1.25fr)_420px]",
  hero:
    "mt-6 grid items-stretch gap-4 min-[1120px]:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]",
};

export function getWorkbenchLayoutClasses(): WorkbenchLayoutClasses {
  return WORKBENCH_LAYOUT_CLASSES;
}

export function getLoadingPresentation(tone: LoadingTone): LoadingPresentation {
  const presentations: Record<LoadingTone, LoadingPresentation> = {
    document: {
      variant: "manuscript",
      overlayClassName: "bg-white/72 backdrop-blur-xl dark:bg-surface-950/72",
      accentClassName: "text-brand-500",
    },
    ai: {
      variant: "ai",
      overlayClassName: "bg-brand-50/72 backdrop-blur-xl dark:bg-brand-950/35",
      accentClassName: "text-accent-500",
    },
    quiet: {
      variant: "dots",
      overlayClassName: "bg-surface-50/70 backdrop-blur-md dark:bg-surface-950/68",
      accentClassName: "text-surface-500",
    },
    settings: {
      variant: "cursor",
      overlayClassName: "bg-surface-50/76 backdrop-blur-xl dark:bg-surface-950/74",
      accentClassName: "text-amber-500",
    },
    brain: {
      variant: "ai",
      overlayClassName: "bg-accent-50/72 backdrop-blur-xl dark:bg-accent-950/30",
      accentClassName: "text-accent-500",
    },
  };

  return presentations[tone];
}

export function getPageTransitionProfile(pageKey: string): PageTransitionProfile {
  if (pageKey === "editor") {
    return { className: "page-transition-editor", durationMs: 260, y: "4px", scale: "0.996", blur: "1px" };
  }

  if (pageKey === "documents" || pageKey === "favorites" || pageKey === "trash") {
    return { className: "page-transition-library", durationMs: 320, y: "10px", scale: "0.99", blur: "3px" };
  }

  if (pageKey === "settings" || pageKey === "model-config") {
    return { className: "page-transition-settings", durationMs: 300, y: "6px", scale: "0.994", blur: "2px" };
  }

  if (pageKey === "brain") {
    return { className: "page-transition-brain", durationMs: 380, y: "12px", scale: "0.986", blur: "5px" };
  }

  if (pageKey === "workbench" || pageKey === "records" || pageKey === "record-history") {
    return { className: "page-transition-workbench", durationMs: 360, y: "8px", scale: "0.988", blur: "4px" };
  }

  return { className: "page-transition-default", durationMs: 340, y: "8px", scale: "0.99", blur: "3px" };
}
