import { cn } from "@/lib/utils";
import { Pencil, Trash2, FolderInput, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/I18nProvider";

interface DocumentCardProps {
  title: string;
  preview: string;
  date: string;
  fullDate?: string;
  categoryKey: "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general";
  icon: LucideIcon;
  iconBg?: string;
  viewMode?: "grid" | "list";
  onClick?: () => void;
  onDelete?: () => void;
  onMoveToGroup?: () => void;
}

export function DocumentCard({
  title,
  preview,
  date,
  fullDate,
  categoryKey,
  icon: Icon,
  iconBg = "bg-brand-100 text-brand-600",
  viewMode = "grid",
  onClick,
  onDelete,
  onMoveToGroup,
}: DocumentCardProps) {
  const { t } = useI18n();

  // List view: horizontal layout
  if (viewMode === "list") {
    return (
      <div
        onClick={onClick}
        className={cn(
          "group flex items-center gap-4 rounded-lg border border-surface-200 bg-white px-4 py-3 transition-all duration-200",
          "dark:border-surface-800 dark:bg-surface-900",
          onClick ? "hover:bg-surface-50 active:scale-[0.99] cursor-pointer dark:hover:bg-surface-800" : ""
        )}
      >
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-surface-900 truncate dark:text-surface-100">{title}</h4>
          <p className="text-xs text-surface-500 truncate">{preview}</p>
        </div>
        <div className="shrink-0 text-right" title={fullDate || date}>
          {fullDate && <div className="text-xs text-surface-500 dark:text-surface-400">{fullDate}</div>}
          <div className="text-[11px] text-surface-400">{date}</div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 shrink-0">
          {onMoveToGroup && (
            <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-brand-500" title={t("group.moveTo")}
              onClick={(e) => { e.stopPropagation(); onMoveToGroup(); }}>
              <FolderInput className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="h-6 w-6" title={t("card.edit")}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-red-500" title={t("card.delete")}
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  // Grid view: card layout
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative flex flex-col rounded-xl border border-surface-200 bg-white p-5 transition-all duration-200",
        "dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700 dark:hover:shadow-lg dark:hover:shadow-surface-900/50",
        onClick ? "hover:shadow-md hover:border-surface-300 active:scale-[0.98] cursor-pointer" : ""
      )}
    >
      <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-full bg-surface-200 dark:bg-surface-700" />
      <div className="flex items-center justify-between mb-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-surface-400">
          {t(categoryKey)}
        </span>
      </div>
      <h4 className="mb-2 text-sm font-semibold leading-tight text-surface-900 dark:text-surface-100 truncate">
        {title}
      </h4>
      <p className="mb-4 flex-1 text-xs leading-relaxed text-surface-500 line-clamp-3">
        {preview}
      </p>
      <div className="flex items-center justify-between">
        <div title={fullDate || date}>
          {fullDate && <div className="text-xs text-surface-500 dark:text-surface-400">{fullDate}</div>}
          <div className="text-[11px] text-surface-400">{date}</div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {onMoveToGroup && (
            <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-brand-500" title={t("group.moveTo")}
              onClick={(e) => { e.stopPropagation(); onMoveToGroup(); }}>
              <FolderInput className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="h-6 w-6" title={t("card.edit")}
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="h-6 w-6 hover:text-red-500" title={t("card.delete")}
            onClick={(e) => { e.stopPropagation(); onDelete?.(); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
