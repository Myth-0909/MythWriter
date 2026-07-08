import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { Activity, Gauge, PenLine, Sparkles, type LucideIcon } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { cn } from "@/lib/utils";

export type CreationWeatherTone = "blank" | "quiet" | "steady" | "active" | "organize";
export type DocumentLifelineStage = "empty" | "seed" | "forming" | "polish" | "organize" | "settle";

interface WeatherSignal {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
}

interface CreationWeatherProps {
  label: string;
  tone: CreationWeatherTone;
  title: string;
  description: string;
  intensity: number;
  signals: WeatherSignal[];
  className?: string;
  formatValue: (value: number) => string;
}

interface DocumentLifelineProps {
  label: string;
  stage: DocumentLifelineStage;
  title: string;
  description: string;
  progress: number;
  steps: string[];
  tags: string[];
  className?: string;
}

const weatherStyles: Record<CreationWeatherTone, { shell: string; icon: string; line: string; glow: string }> = {
  blank: {
    shell: "border-surface-200 bg-white/76 dark:border-surface-800 dark:bg-surface-950/45",
    icon: "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-300",
    line: "bg-surface-400 dark:bg-surface-500",
    glow: "from-surface-100/80 via-transparent to-transparent dark:from-surface-800/45",
  },
  quiet: {
    shell: "border-brand-200/70 bg-white/78 dark:border-brand-500/25 dark:bg-surface-950/45",
    icon: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    line: "bg-brand-400 dark:bg-brand-300",
    glow: "from-brand-100/80 via-transparent to-transparent dark:from-brand-500/15",
  },
  steady: {
    shell: "border-emerald-200/70 bg-white/78 dark:border-emerald-500/25 dark:bg-surface-950/45",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    line: "bg-emerald-400 dark:bg-emerald-300",
    glow: "from-emerald-100/80 via-transparent to-transparent dark:from-emerald-500/15",
  },
  active: {
    shell: "border-amber-200/80 bg-white/80 dark:border-amber-500/25 dark:bg-surface-950/45",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    line: "bg-amber-400 dark:bg-amber-300",
    glow: "from-amber-100/80 via-transparent to-transparent dark:from-amber-500/15",
  },
  organize: {
    shell: "border-cyan-200/75 bg-white/78 dark:border-cyan-500/25 dark:bg-surface-950/45",
    icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    line: "bg-cyan-400 dark:bg-cyan-300",
    glow: "from-cyan-100/80 via-transparent to-transparent dark:from-cyan-500/15",
  },
};

const lifelineStyles: Record<DocumentLifelineStage, { icon: string; line: string; text: string }> = {
  empty: {
    icon: "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-300",
    line: "bg-surface-400 dark:bg-surface-500",
    text: "text-surface-500 dark:text-surface-400",
  },
  seed: {
    icon: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    line: "bg-brand-400 dark:bg-brand-300",
    text: "text-brand-700 dark:text-brand-300",
  },
  forming: {
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    line: "bg-emerald-400 dark:bg-emerald-300",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  polish: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    line: "bg-amber-400 dark:bg-amber-300",
    text: "text-amber-700 dark:text-amber-300",
  },
  organize: {
    icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    line: "bg-cyan-400 dark:bg-cyan-300",
    text: "text-cyan-700 dark:text-cyan-300",
  },
  settle: {
    icon: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    line: "bg-brand-400 dark:bg-brand-300",
    text: "text-brand-700 dark:text-brand-300",
  },
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function useGsapAtmosphere(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-atmosphere-item]",
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.42, ease: "power2.out", stagger: 0.055 }
      );

      gsap.to("[data-lifeline-pulse]", {
        scaleX: 1.025,
        opacity: 0.86,
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        transformOrigin: "left center",
      });
    }, rootRef);

    return () => ctx.revert();
  }, [rootRef]);
}

export function CreationWeather({
  label,
  tone,
  title,
  description,
  intensity,
  signals,
  className,
  formatValue,
}: CreationWeatherProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const styles = weatherStyles[tone];

  useGsapAtmosphere(rootRef);

  return (
    <div
      ref={rootRef}
      className={cn("relative overflow-hidden rounded-2xl border p-3.5 shadow-sm", styles.shell, className)}
    >
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", styles.glow)} />
      <div className="relative flex items-start gap-2.5" data-atmosphere-item>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          <Sparkles className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">
              {label}
            </p>
            <Gauge className="h-3.5 w-3.5 text-surface-400" />
          </div>
          <h3 className="mt-0.5 break-words text-base font-semibold leading-snug text-surface-950 dark:text-surface-50">
            {title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
            {description}
          </p>
        </div>
      </div>

      <div className="relative mt-3 grid gap-1.5 sm:grid-cols-3" data-atmosphere-item>
        {signals.map((signal) => (
          <div
            key={signal.label}
            className="rounded-xl border border-white/80 bg-white/58 px-2.5 py-2 dark:border-white/10 dark:bg-surface-950/32"
          >
            <div className="flex items-start justify-between gap-1.5">
              <span className="min-w-0 text-[10px] font-medium leading-3.5 text-surface-500 dark:text-surface-400">
                {signal.label}
              </span>
              <signal.icon className="h-3.5 w-3.5 shrink-0 text-surface-400" />
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <CountUp
                value={signal.value}
                formatValue={(value) => formatValue(Math.round(value))}
                className="text-lg font-semibold tabular-nums text-surface-950 dark:text-surface-50"
              />
              <span className="text-[10px] font-medium text-surface-400">{signal.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-surface-900" data-atmosphere-item>
        <div
          data-lifeline-pulse
          className={cn("h-full origin-left rounded-full", styles.line)}
          style={{ width: `${clampPercent(intensity)}%` }}
        />
      </div>
    </div>
  );
}

export function DocumentLifeline({
  label,
  stage,
  title,
  description,
  progress,
  steps,
  tags,
  className,
}: DocumentLifelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const styles = lifelineStyles[stage];

  useGsapAtmosphere(rootRef);

  return (
    <div
      ref={rootRef}
      className={cn("border-t border-white/75 pt-4 dark:border-white/10", className)}
    >
      <div className="flex items-start gap-2.5" data-atmosphere-item>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
          <PenLine className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">
              {label}
            </p>
            <Activity className="h-3.5 w-3.5 text-surface-400" />
          </div>
          <h3 className={cn("mt-0.5 break-words text-sm font-semibold leading-snug", styles.text)}>
            {title}
          </h3>
          <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-3" data-atmosphere-item>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-900">
          <div
            data-lifeline-pulse
            className={cn("h-full origin-left rounded-full", styles.line)}
            style={{ width: `${clampPercent(progress)}%` }}
          />
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] font-medium text-surface-400">
          {steps.map((step, index) => (
            <span
              key={step}
              className={cn(index <= Math.floor(clampPercent(progress) / 25) ? "text-surface-700 dark:text-surface-200" : "")}
            >
              {step}
            </span>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" data-atmosphere-item>
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-surface-200 bg-white/70 px-2 py-1 text-[10px] font-medium text-surface-500 dark:border-surface-700 dark:bg-surface-900/65 dark:text-surface-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
