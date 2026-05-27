import { useState } from "react";
import { Search, Star, Trash2,
  FileText, Palette, Lightbulb, Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { categoryI18nKey, categoryColors, type DocumentCategory } from "@/types";

const iconByCategory: Record<DocumentCategory, LucideIcon> = {
  design: Palette, journal: Lightbulb, planning: Target, research: Search, general: FileText,
};

interface DocumentListProps {
  activeId?: string;
  onSelect?: (id: string) => void;
}

export function DocumentList({ activeId, onSelect }: DocumentListProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { documents, toggleFavorite, moveToTrash, updateDocument } = useDocuments();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const isActive = (id: string) => id === activeId;

  const handleToggleFavorite = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleFavorite(id);
    const doc = documents.find((d) => d.id === id);
    toast(doc?.isFavorite ? t("toast.favRemoved") : t("toast.favAdded"), "success");
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const doc = documents.find((d) => d.id === deleteTarget);
    const deleteIndex = documents.findIndex((d) => d.id === deleteTarget);
    const nextDoc = deleteIndex >= 0 ? documents[deleteIndex + 1] || documents[deleteIndex - 1] : undefined;
    const shouldSwitchDoc = activeId === deleteTarget && !!nextDoc;

    setDeleteTarget(null);
    if (shouldSwitchDoc && nextDoc) {
      onSelect?.(nextDoc.id);
    }

    try {
      await moveToTrash(deleteTarget);
      if (doc) {
        toast(`"${doc.title}" ${t("toast.movedToTrash")}`, "info");
      }
    } catch (error) {
      if (shouldSwitchDoc) {
        onSelect?.(deleteTarget);
      }
      toast(t("toast.deleteFailed"), "error");
    }
  };

  const handleChangeCategory = (e: React.MouseEvent, docId: string, cat: DocumentCategory) => {
    e.stopPropagation();
    const doc = documents.find((d) => d.id === docId);
    if (doc && cat !== doc.category) {
      updateDocument(docId, { category: cat });
    }
  };

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-950">
      <div className="border-b border-surface-200 px-4 py-4 dark:border-surface-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
          <input
            type="text"
            placeholder={t("editor.searchDocs")}
            className="w-full rounded-md border border-surface-200 bg-surface-50 py-2 pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-surface-300 focus:border-transparent dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
          />
        </div>
      </div>

      <Scrollbar className="flex-1 px-2 py-2">
        <div className="flex flex-col gap-1">
          {documents.map((doc) => {
            const active = isActive(doc.id);
            const Icon = iconByCategory[doc.category];
            const colorClass = categoryColors[doc.category];
            return (
              <button
                key={doc.id}
                onClick={() => onSelect?.(doc.id)}
                className={cn(
                  "group flex flex-col gap-1 rounded-lg px-4 py-3 text-left transition-colors cursor-pointer",
                  active
                    ? "bg-surface-100 shadow-sm dark:bg-surface-800"
                    : "hover:bg-surface-50 dark:hover:bg-surface-900"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Category badge - clickable to change type */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          className={`shrink-0 inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-medium cursor-pointer border transition-colors ${colorClass.split(" ")[0]} ${colorClass.split(" ")[1]} hover:ring-1 hover:ring-surface-300 dark:hover:ring-surface-600`}
                          title={t("documents.clickToSwitch")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          <span>{t(categoryI18nKey[doc.category])}</span>
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[170px]">
                        <DropdownMenuLabel>{t("documents.switchCategory")}</DropdownMenuLabel>
                        {(
                          Object.entries(categoryI18nKey) as [DocumentCategory, string][]
                        ).map(([cat], idx) => {
                          const CatIcon = iconByCategory[cat];
                          const catColor = categoryColors[cat];
                          const isCurrent = doc.category === cat;
                          return (
                            <DropdownMenuItem
                              key={cat}
                              index={idx}
                              onClick={(e) => handleChangeCategory(e, doc.id, cat)}
                              className={isCurrent ? "bg-surface-100 dark:bg-surface-800" : ""}
                            >
                              <div className={`flex h-5 w-5 items-center justify-center rounded dropdown-item-icon ${catColor.split(" ")[0]}`}>
                                <CatIcon className={`h-3 w-3 ${catColor.split(" ")[1]}`} />
                              </div>
                              <span>{t(categoryI18nKey[cat])}</span>
                              {isCurrent && <span className="ml-auto text-[10px] text-brand-500">✓</span>}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <h3 className={cn(
                      "text-sm font-medium truncate",
                      active ? "text-surface-900 dark:text-surface-100" : "text-surface-700 dark:text-surface-300"
                    )}>
                      {doc.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <span
                      onClick={(e) => handleToggleFavorite(e, doc.id)}
                      className={cn(
                        "p-0.5 rounded hover:bg-surface-200 cursor-pointer transition-colors dark:hover:bg-surface-700",
                        doc.isFavorite ? "text-amber-500" : "text-surface-400"
                      )}
                    >
                      <Star className="h-3.5 w-3.5" fill={doc.isFavorite ? "currentColor" : "none"} />
                    </span>
                    <span
                      onClick={(e) => handleDeleteClick(e, doc.id)}
                      className="p-0.5 rounded hover:bg-red-100 text-surface-400 hover:text-red-500 cursor-pointer transition-colors dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-surface-500 ml-7">{doc.preview}</p>
              </button>
            );
          })}
        </div>
      </Scrollbar>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
