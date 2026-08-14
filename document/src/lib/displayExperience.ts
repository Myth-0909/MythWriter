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
  focusMeta: string;
  focusActions: string;
  charts: string;
};

/**
 * Resolution-tier workbench layout (viewport breakpoints).
 * App shell is min 1024px with a ~240px sidebar, so content is often ~780–1100px.
 * Use flexible fr columns (no large fixed mins) so the focus card stays readable
 * on small/medium panes, then densify on xl/2xl.
 *
 * - small (< xl): main column only; hero 2-up; charts 2-up under the hero
 * - medium (xl): writer's flow rail beside main (charts stack in the rail)
 * - large (2xl): slightly wider rail, roomier hero split
 */
const WORKBENCH_LAYOUT_CLASSES: WorkbenchLayoutClasses = {
  shell:
    "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] xl:gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,380px)]",
  hero:
    "mt-5 grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] sm:gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(240px,0.85fr)]",
  focusMeta: "mt-3 grid grid-cols-2 gap-2",
  focusActions: "mt-4 grid grid-cols-2 gap-2",
  charts: "grid grid-cols-2 gap-3 xl:grid-cols-1 xl:gap-3",
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
