import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, FolderInput, Star, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";
import { Tooltip } from "@/components/ui/tooltip";
import { getFavoriteToggleKey } from "@/lib/interactionState";

type CategoryKey = "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general";

interface DocumentCardProps {
  title: string;
  preview: string;
  date: string;
  fullDate?: string;
  categoryKey: CategoryKey;
  icon: LucideIcon;
  iconBg?: string;
  viewMode?: "grid" | "list";
  isFavorite?: boolean;
  onClick?: () => void;
  onToggleFavorite?: () => void;
  onDelete?: () => void;
  onMoveToGroup?: () => void;
}

const accentByCategory: Record<CategoryKey, string> = {
  "card.design": "from-amber-400 via-orange-400 to-amber-200",
  "card.journal": "from-emerald-400 via-teal-400 to-lime-200",
  "card.planning": "from-rose-400 via-red-400 to-orange-200",
  "card.research": "from-cyan-400 via-sky-400 to-blue-200",
  "card.general": "from-brand-400 via-blue-400 to-slate-200",
};

export function DocumentCard({
  title,
  preview,
  date,
  fullDate,
  categoryKey,
  icon: Icon,
  iconBg = "bg-brand-100 text-brand-600",
  viewMode = "grid",
  isFavorite = false,
  onClick,
  onToggleFavorite,
  onDelete,
  onMoveToGroup,
}: DocumentCardProps) {
  const { t } = useI18n();
  const displayPreview = preview?.trim() || t("card.noPreview");
  const favoriteLabel = t(getFavoriteToggleKey(isFavorite));

  const keyboardOpen = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  const actions = (
    <div
      className={cn(
        "flex items-center gap-1 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100",
        isFavorite ? "opacity-100" : "opacity-0"
      )}
    >
      {onToggleFavorite && (
        <Tooltip content={favoriteLabel} delay={150}>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn(
              "h-7 w-7",
              isFavorite
                ? "text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                : "text-surface-500 hover:text-amber-500"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favoriteLabel}
            aria-pressed={isFavorite}
          >
            <Star className="h-3.5 w-3.5" fill={isFavorite ? "currentColor" : "none"} />
          </Button>
        </Tooltip>
      )}
      {onMoveToGroup && (
        <Tooltip content={t("group.moveTo")} delay={150}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 text-surface-500 hover:text-brand-500"
            onClick={(e) => {
              e.stopPropagation();
              onMoveToGroup();
            }}
            aria-label={t("group.moveTo")}
          >
            <FolderInput className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      )}
      <Tooltip content={t("card.delete")} delay={150}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-surface-500 hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          aria-label={t("card.delete")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  );

  if (viewMode === "list") {
    return (
      <div
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={keyboardOpen}
        className={cn(
          "group relative flex items-center gap-4 overflow-hidden rounded-xl border border-surface-200 bg-white px-4 py-3 transition-all duration-200",
          "dark:border-surface-800 dark:bg-surface-900",
          onClick && "cursor-pointer hover:border-surface-300 hover:bg-surface-50 active:scale-[0.99] dark:hover:border-surface-700 dark:hover:bg-surface-900"
        )}
      >
        <div className={cn("absolute bottom-0 left-0 top-0 w-1 bg-gradient-to-b", accentByCategory[categoryKey])} />
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconBg)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-surface-950 dark:text-surface-50">{title}</h4>
            <span className="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-semibold text-surface-500 dark:bg-surface-800 dark:text-surface-400">
              {t(categoryKey)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-surface-500 dark:text-surface-400">{displayPreview}</p>
        </div>
        <div className="shrink-0 text-right" title={fullDate || date}>
          {fullDate && <div className="text-xs text-surface-500 dark:text-surface-400">{fullDate}</div>}
          <div className="text-[11px] text-surface-400">{date}</div>
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={keyboardOpen}
      className={cn(
        "group relative flex min-h-[210px] flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white p-5 shadow-sm transition-all duration-200",
        "dark:border-surface-800 dark:bg-surface-900",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:border-surface-300 hover:shadow-md active:scale-[0.99] dark:hover:border-surface-700"
      )}
    >
      <div className={cn("absolute left-0 right-0 top-0 h-1 bg-gradient-to-r", accentByCategory[categoryKey])} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", iconBg)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-surface-100 px-2.5 py-1 text-[10px] font-semibold text-surface-500 dark:bg-surface-800 dark:text-surface-400">
            {t(categoryKey)}
          </span>
          {actions}
        </div>
      </div>

      <h4 className="mt-5 line-clamp-2 text-base font-semibold leading-snug text-surface-950 dark:text-surface-50">
        {title}
      </h4>
      <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-surface-500 dark:text-surface-400">
        {displayPreview}
      </p>

      <div className="mt-5 flex items-center justify-between border-t border-surface-100 pt-4 dark:border-surface-800">
        <div title={fullDate || date}>
          {fullDate && <div className="text-[11px] text-surface-500 dark:text-surface-400">{fullDate}</div>}
          <div className="text-xs font-medium text-surface-400">{date}</div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-100 text-surface-500 transition-colors group-hover:bg-brand-50 group-hover:text-brand-600 dark:bg-surface-800 dark:text-surface-400 dark:group-hover:bg-brand-500/10 dark:group-hover:text-brand-300">
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
