import { useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type LoaderSize = "sm" | "md" | "lg";
export type CreativeLoaderVariant = "manuscript" | "ai" | "cursor" | "dots";
type LoadingTone = "document" | "ai" | "quiet";

interface LoadingSpinnerProps {
  size?: LoaderSize;
  className?: string;
}

interface CreativeLoaderProps extends LoadingSpinnerProps {
  variant?: CreativeLoaderVariant;
  label?: string;
  labelClassName?: string;
}

interface InlineLoadingProps extends CreativeLoaderProps {}

interface LoadingOverlayProps {
  message?: string;
  tone?: LoadingTone;
  className?: string;
}

interface DocumentSkeletonProps {
  count?: number;
  viewMode?: "grid" | "list";
  className?: string;
}

const glyphSizes: Record<LoaderSize, string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const compactGlyphSizes: Record<LoaderSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

const iconSizes: Record<LoaderSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

const labelSizes: Record<LoaderSize, string> = {
  sm: "text-[11px]",
  md: "text-xs",
  lg: "text-sm",
};

const dotSizes: Record<LoaderSize, string> = {
  sm: "h-1 w-1",
  md: "h-1.5 w-1.5",
  lg: "h-2 w-2",
};

const manuscriptLines: Record<LoaderSize, string[]> = {
  sm: ["w-3.5", "w-4", "w-2.5"],
  md: ["w-5", "w-7", "w-4"],
  lg: ["w-7", "w-9", "w-6"],
};

const compactManuscriptLines: Record<LoaderSize, string[]> = {
  sm: ["w-2", "w-2.5"],
  md: ["w-2.5", "w-3.5"],
  lg: ["w-4", "w-5"],
};

function ManuscriptGlyph({ size, compact = false }: { size: LoaderSize; compact?: boolean }) {
  const lines = compact ? compactManuscriptLines[size] : manuscriptLines[size];

  return (
    <span
      className={cn(
        "zn-loader-float relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-brand-200/80 bg-white text-brand-600 shadow-[0_10px_28px_rgba(185,149,78,0.18)] dark:border-brand-400/20 dark:bg-surface-900 dark:text-brand-300",
        compact ? "rounded-md" : "rounded-xl",
        compact ? compactGlyphSizes[size] : glyphSizes[size]
      )}
      aria-hidden="true"
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(216,189,115,0.32),transparent_36%)]" />
      <FileText className={cn("relative opacity-70", iconSizes[size])} strokeWidth={1.7} />
      <span className={cn("absolute inset-x-[24%] space-y-0.5", compact ? "top-[34%]" : "top-[31%]")}>
        {lines.map((line, index) => (
          <span
            key={`${line}-${index}`}
            className={cn("zn-manuscript-line block h-[2px] origin-left rounded-full bg-brand-500/70 dark:bg-brand-300/75", line)}
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </span>
      <span className="zn-manuscript-scan absolute left-[18%] right-[18%] top-0 h-6 rounded-full bg-gradient-to-b from-transparent via-brand-200/70 to-transparent dark:via-brand-300/25" />
    </span>
  );
}

function AiGlyph({ size, compact = false }: { size: LoaderSize; compact?: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border border-accent-200/70 bg-white text-accent-500 shadow-[0_10px_28px_rgba(99,102,241,0.16)] dark:border-accent-400/20 dark:bg-surface-900 dark:text-accent-300",
        compact ? compactGlyphSizes[size] : glyphSizes[size]
      )}
      aria-hidden="true"
    >
      <span className="zn-ai-orbit absolute inset-1 rounded-full border border-dashed border-accent-300/55 dark:border-accent-300/35" />
      <span className="zn-ai-orbit zn-ai-orbit-reverse absolute inset-2 rounded-full border-t border-brand-300/70 dark:border-brand-300/40" />
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_25%,rgba(165,180,252,0.26),transparent_38%)]" />
      <Sparkles className={cn("relative", iconSizes[size])} strokeWidth={1.8} />
      <span className="zn-ai-spark absolute right-[18%] top-[20%] h-1.5 w-1.5 rounded-full bg-brand-300" />
      <span className="zn-ai-spark absolute bottom-[18%] left-[22%] h-1 w-1 rounded-full bg-accent-300 [animation-delay:180ms]" />
    </span>
  );
}

function DotsGlyph({ size, compact = false }: { size: LoaderSize; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1 text-current",
        compact ? compactGlyphSizes[size] : glyphSizes[size]
      )}
      aria-hidden="true"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn("zn-ink-dot rounded-full bg-current", dotSizes[size])}
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function CursorGlyph({ size, compact = false }: { size: LoaderSize; compact?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 text-current",
        compact ? compactGlyphSizes[size] : glyphSizes[size]
      )}
      aria-hidden="true"
    >
      <span className={cn("zn-writing-cursor rounded-full bg-current", size === "lg" ? "h-7 w-1" : size === "md" ? "h-5 w-0.5" : "h-4 w-0.5")} />
      <span className="flex flex-col gap-1">
        <span className={cn("zn-cursor-line h-1 rounded-full bg-current/45", size === "lg" ? "w-7" : size === "md" ? "w-5" : "w-3.5")} />
        <span className={cn("zn-cursor-line h-1 rounded-full bg-current/25 [animation-delay:160ms]", size === "lg" ? "w-5" : size === "md" ? "w-4" : "w-2.5")} />
      </span>
    </span>
  );
}

function renderGlyph(variant: CreativeLoaderVariant, size: LoaderSize, compact = false) {
  if (variant === "manuscript") return <ManuscriptGlyph size={size} compact={compact} />;
  if (variant === "ai") return <AiGlyph size={size} compact={compact} />;
  if (variant === "cursor") return <CursorGlyph size={size} compact={compact} />;
  return <DotsGlyph size={size} compact={compact} />;
}

export function CreativeLoader({
  variant = "manuscript",
  size = "md",
  label,
  className,
  labelClassName,
}: CreativeLoaderProps) {
  return (
    <div
      className={cn("inline-flex flex-col items-center justify-center gap-2 text-brand-500", className)}
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
    >
      {renderGlyph(variant, size)}
      {label && (
        <span className={cn("text-center font-medium leading-none text-surface-500 dark:text-surface-400", labelSizes[size], labelClassName)}>
          {label}
        </span>
      )}
    </div>
  );
}

export function InlineLoading({
  variant = "dots",
  size = "sm",
  label,
  className,
  labelClassName,
}: InlineLoadingProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 align-middle text-current", className)}
      role={label ? "status" : undefined}
      aria-live={label ? "polite" : undefined}
    >
      {renderGlyph(variant, size, true)}
      {label && <span className={cn("leading-none", labelSizes[size], labelClassName)}>{label}</span>}
    </span>
  );
}

export function DocumentSkeleton({ count = 6, viewMode = "grid", className }: DocumentSkeletonProps) {
  return (
    <div
      className={cn(
        viewMode === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "flex flex-col gap-2",
        className
      )}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "zn-skeleton-sheen relative overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900",
            viewMode === "grid" ? "min-h-[184px] p-4" : "flex min-h-[92px] items-center gap-4 p-4"
          )}
        >
          <div className="h-10 w-10 shrink-0 rounded-xl bg-brand-100/80 dark:bg-brand-500/15" />
          <div className={cn("min-w-0 flex-1", viewMode === "grid" ? "mt-5" : "")}>
            <div className="h-3 w-2/3 rounded-full bg-surface-200 dark:bg-surface-700" />
            <div className="mt-3 h-2.5 w-full rounded-full bg-surface-100 dark:bg-surface-800" />
            <div className="mt-2 h-2.5 w-4/5 rounded-full bg-surface-100 dark:bg-surface-800" />
            {viewMode === "grid" && (
              <div className="mt-8 flex items-center justify-between">
                <div className="h-2.5 w-16 rounded-full bg-surface-100 dark:bg-surface-800" />
                <div className="h-7 w-7 rounded-lg bg-surface-100 dark:bg-surface-800" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return <span className={cn("inline-flex text-current", className)}>{renderGlyph("dots", size, true)}</span>;
}

export function useLoading() {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");

  const withLoading = async <T,>(fn: () => Promise<T>, msg = ""): Promise<T> => {
    setLoading(true);
    setLoadingMsg(msg);
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
    try {
      return await fn();
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  return { loading, loadingMsg, withLoading };
}

const overlayToneClasses: Record<LoadingTone, string> = {
  document:
    "bg-[radial-gradient(circle_at_48%_42%,rgba(216,189,115,0.18),transparent_34%),linear-gradient(90deg,rgba(185,149,78,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(185,149,78,0.08)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]",
  ai:
    "bg-[radial-gradient(circle_at_50%_42%,rgba(99,102,241,0.16),transparent_32%),radial-gradient(circle_at_44%_58%,rgba(185,149,78,0.12),transparent_30%)]",
  quiet:
    "bg-[radial-gradient(circle_at_50%_45%,rgba(148,163,184,0.18),transparent_34%)]",
};

export function LoadingOverlay({ message, tone = "document", className }: LoadingOverlayProps) {
  const variant: CreativeLoaderVariant = tone === "ai" ? "ai" : tone === "quiet" ? "dots" : "manuscript";

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-white/85 backdrop-blur-[5px] fade-in dark:bg-surface-950/85",
        className
      )}
      role={message ? "status" : undefined}
      aria-live={message ? "polite" : undefined}
    >
      <div className={cn("pointer-events-none absolute inset-0 opacity-90", overlayToneClasses[tone])} />
      <div className="pointer-events-none absolute inset-x-10 top-1/2 h-px -translate-y-12 bg-gradient-to-r from-transparent via-brand-300/45 to-transparent dark:via-brand-300/20" />
      <div className="relative flex min-w-[190px] flex-col items-center rounded-2xl border border-white/70 bg-white/78 px-7 py-6 shadow-[0_22px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-surface-900/78 dark:shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
        <CreativeLoader
          variant={variant}
          size="lg"
          label={message}
          className={tone === "ai" ? "text-accent-500" : "text-brand-500"}
        />
      </div>
    </div>
  );
}
