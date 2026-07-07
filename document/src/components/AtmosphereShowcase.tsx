import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  FileText,
  Lightbulb,
  MapPin,
  PenLine,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";
import { cn } from "@/lib/utils";

type EmptySceneVariant = "paper" | "desk" | "stars";

export interface StarMapNode {
  id: string;
  title: string;
  category?: string | null;
  categoryId?: string | null;
  color?: string | null;
  updatedAt?: string;
}

interface WorldviewStarMapProps {
  nodes: StarMapNode[];
  className?: string;
  compact?: boolean;
}

interface EmptySceneProps {
  variant: EmptySceneVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  className?: string;
}

const NODE_LAYOUT = [
  { x: 48, y: 44, size: 58 },
  { x: 24, y: 24, size: 44 },
  { x: 72, y: 28, size: 50 },
  { x: 28, y: 68, size: 48 },
  { x: 76, y: 68, size: 42 },
  { x: 52, y: 18, size: 38 },
  { x: 14, y: 48, size: 36 },
  { x: 88, y: 48, size: 36 },
  { x: 48, y: 78, size: 40 },
  { x: 64, y: 54, size: 34 },
] as const;

const NODE_LINKS = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [2, 5],
  [1, 6],
  [4, 7],
  [3, 8],
  [0, 9],
] as const;

const NODE_COLORS = ["#0f9f8f", "#c79a39", "#4f8fd7", "#d8675d", "#7c6bd6", "#328764"];

function hashToColor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % NODE_COLORS.length;
  return NODE_COLORS[Math.abs(hash)];
}

function nodeColor(node: StarMapNode) {
  return node.color || hashToColor(node.categoryId || node.category || node.id);
}

function nodeIcon(category?: string | null) {
  const value = (category || "").toLowerCase();
  if (value.includes("角色") || value.includes("character")) return UserRound;
  if (value.includes("地点") || value.includes("location") || value.includes("place")) return MapPin;
  if (value.includes("概念") || value.includes("concept")) return Lightbulb;
  return Sparkles;
}

function sceneKeys(variant: EmptySceneVariant) {
  if (variant === "paper") {
    return {
      title: "atmosphere.empty.paper.title" as const,
      description: "atmosphere.empty.paper.desc" as const,
      icon: FileText,
      accent: "text-brand-600 bg-brand-50 border-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:border-brand-800",
    };
  }
  if (variant === "desk") {
    return {
      title: "atmosphere.empty.desk.title" as const,
      description: "atmosphere.empty.desk.desc" as const,
      icon: BookOpen,
      accent: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    };
  }
  return {
    title: "atmosphere.empty.stars.title" as const,
    description: "atmosphere.empty.stars.desc" as const,
    icon: Brain,
    accent: "text-accent-600 bg-accent-50 border-accent-200 dark:bg-accent-950/40 dark:text-accent-300 dark:border-accent-800",
  };
}

function StatBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-surface-400 dark:text-surface-500">{label}</p>
      <div className="mt-1 text-xl font-bold leading-none text-surface-950 dark:text-white">{value}</div>
    </div>
  );
}

export function EmptyScene({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  className,
}: EmptySceneProps) {
  const { t } = useI18n();
  const meta = sceneKeys(variant);
  const SceneIcon = meta.icon;

  return (
    <div
      className={cn(
        "flex min-h-[210px] flex-col items-center justify-center overflow-hidden rounded-[8px] border border-dashed border-surface-200 bg-white/70 p-6 text-center dark:border-surface-700 dark:bg-surface-900/70",
        compact && "min-h-[140px] p-4",
        className
      )}
    >
      <div className="relative mb-4 flex h-20 w-28 items-center justify-center">
        <div className="absolute inset-x-4 bottom-2 h-8 rounded-full bg-surface-100 dark:bg-surface-800" />
        <div className={cn("relative flex h-14 w-14 items-center justify-center rounded-[8px] border shadow-sm zn-atmosphere-float", meta.accent)}>
          <SceneIcon className="h-6 w-6" />
        </div>
        <span className="absolute left-5 top-2 h-2 w-2 rounded-full bg-brand-400 zn-atmosphere-pulse" />
        <span className="absolute right-7 top-5 h-1.5 w-1.5 rounded-full bg-emerald-400 zn-atmosphere-pulse-delayed" />
        {variant === "paper" && <PenLine className="absolute bottom-4 right-6 h-4 w-4 text-brand-500" />}
        {variant === "stars" && <Sparkles className="absolute bottom-5 right-5 h-4 w-4 text-accent-500" />}
      </div>
      <p className="text-base font-bold text-surface-950 dark:text-white">{title || t(meta.title)}</p>
      <p className={cn("mt-2 max-w-md text-sm leading-6 text-surface-500 dark:text-surface-400", compact && "text-xs leading-5")}>
        {description || t(meta.description)}
      </p>
      {actionLabel && onAction && (
        <Button type="button" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function WorldviewStarMap({ nodes, className, compact = false }: WorldviewStarMapProps) {
  const { t } = useI18n();
  const displayedNodes = useMemo(() => nodes.slice(0, compact ? 6 : 10), [compact, nodes]);
  const categories = useMemo(
    () => new Set(nodes.map((node) => node.category || node.categoryId || node.id)).size,
    [nodes]
  );
  const recentNodes = nodes.slice(0, 3);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[8px] border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-700 dark:bg-surface-900",
        className
      )}
      data-page-motion
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand-700 dark:text-brand-300">
            <Sparkles className="h-4 w-4" />
            <span>{t("atmosphere.starMap.title")}</span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-500 dark:text-surface-400">
            {t("atmosphere.starMap.desc")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-right">
          <StatBlock label={t("atmosphere.starMap.nodes")} value={nodes.length} />
          <StatBlock label={t("atmosphere.starMap.categories")} value={categories} />
        </div>
      </div>

      {displayedNodes.length === 0 ? (
        <EmptyScene
          variant="stars"
          compact={compact}
          className="mt-5 min-h-[240px] border-surface-200/80 bg-surface-50/70 dark:border-surface-700/80 dark:bg-surface-800/40"
          title={t("atmosphere.starMap.emptyTitle")}
          description={t("atmosphere.starMap.emptyDesc")}
        />
      ) : (
        <div className={cn("mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px]", compact && "lg:grid-cols-1")}>
          <div className="relative min-h-[300px] overflow-hidden rounded-[8px] border border-surface-100 bg-[radial-gradient(circle_at_22%_18%,rgba(20,184,166,0.13),transparent_28%),radial-gradient(circle_at_78%_24%,rgba(185,149,78,0.14),transparent_30%),linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.75))] dark:border-surface-800 dark:bg-[radial-gradient(circle_at_22%_18%,rgba(20,184,166,0.16),transparent_28%),radial-gradient(circle_at_78%_24%,rgba(185,149,78,0.16),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,24,39,0.72))]">
            {NODE_LINKS.map(([from, to]) => {
              if (!displayedNodes[from] || !displayedNodes[to]) return null;
              const a = NODE_LAYOUT[from];
              const b = NODE_LAYOUT[to];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const distance = Math.hypot(dx, dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <span
                  key={`${from}-${to}`}
                  className="absolute h-px origin-left bg-surface-300/80 dark:bg-surface-600/70"
                  style={{
                    left: `${a.x}%`,
                    top: `${a.y}%`,
                    width: `${distance}%`,
                    transform: `rotate(${angle}deg)`,
                  }}
                />
              );
            })}

            {displayedNodes.map((node, index) => {
              const layout = NODE_LAYOUT[index];
              const color = nodeColor(node);
              const Icon = nodeIcon(node.category);
              const style = {
                left: `${layout.x}%`,
                top: `${layout.y}%`,
                "--node-color": color,
              } as CSSProperties;
              return (
                <div
                  key={node.id}
                  className="absolute flex max-w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                  style={style}
                >
                  <div
                    className="flex items-center justify-center rounded-full border-2 bg-white shadow-sm transition-transform duration-300 hover:scale-105 dark:bg-surface-950 zn-star-node"
                    style={{
                      width: layout.size,
                      height: layout.size,
                      borderColor: color,
                      color,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-2 break-words text-xs font-semibold leading-4 text-surface-800 dark:text-surface-100">
                    {node.title}
                  </p>
                  {node.category && (
                    <p className="mt-0.5 break-words text-[10px] leading-3 text-surface-400 dark:text-surface-500">
                      {node.category}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {!compact && (
            <div className="flex flex-col justify-between border-t border-surface-100 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 dark:border-surface-800">
              <div>
                <p className="text-sm font-bold text-surface-950 dark:text-white">{t("atmosphere.starMap.recent")}</p>
                <div className="mt-4 space-y-3">
                  {recentNodes.map((node) => {
                    const color = nodeColor(node);
                    return (
                      <div key={node.id} className="flex items-start gap-3">
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold leading-5 text-surface-800 dark:text-surface-100">{node.title}</p>
                          {node.category && (
                            <p className="mt-0.5 break-words text-xs text-surface-400 dark:text-surface-500">{node.category}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.min(100, Math.max(22, nodes.length * 12))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
