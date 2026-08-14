import { useState } from "react";
import { Search, Star, Trash2,
  FileText, Palette, Lightbulb, Target,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Scrollbar } from "@/components/ui/scrollbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const [query, setQuery] = useState("");
  const visibleDocuments = documents.filter((document) =>
    document.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
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
    <div className="hidden h-full w-[300px] shrink-0 flex-col border-r border-surface-200 bg-white lg:flex xl:w-[320px] 2xl:w-[340px] dark:border-surface-800 dark:bg-surface-950">
      <div className="border-b border-surface-200 px-4 py-4 dark:border-surface-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
          <Input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("editor.searchDocs")}
            placeholder={t("editor.searchDocs")}
            className="h-10 w-full rounded-lg border border-surface-200 bg-surface-50 py-2 pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 transition-colors duration-200 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-300 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
          />
        </div>
      </div>

      <Scrollbar className="flex-1 px-2 py-2">
        <div className="flex flex-col gap-1">
          {visibleDocuments.map((doc) => {
            const active = isActive(doc.id);
            const Icon = iconByCategory[doc.category];
            const colorClass = categoryColors[doc.category];
            return (
              <div
                key={doc.id}
                className={cn(
                  "group relative rounded-xl border-l-2 transition-all duration-200",
                  active
                    ? "border-brand-500 bg-brand-50/70 shadow-sm ring-1 ring-brand-200/60 dark:border-brand-300 dark:bg-brand-500/10 dark:ring-brand-500/20"
                    : "border-transparent hover:bg-surface-50 dark:hover:bg-surface-900"
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onSelect?.(doc.id)}
                  className="h-auto min-h-[76px] w-full flex-col items-stretch gap-1.5 whitespace-normal rounded-xl px-4 py-3.5 text-left hover:bg-transparent"
                >
                  <div className="flex min-w-0 items-center justify-between gap-2 pl-[78px] pr-[68px]">
                    <h3 className={cn(
                      "text-sm font-medium truncate",
                      active ? "text-surface-900 dark:text-surface-100" : "text-surface-700 dark:text-surface-300"
                    )}>
                      {doc.title}
                    </h3>
                  </div>
                <p className="ml-7 line-clamp-2 text-[13px] leading-5 text-surface-500 dark:text-surface-400">{doc.preview}</p>
                </Button>

                <div className="absolute left-4 top-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t("documents.clickToSwitch")}
                        className={`h-6 gap-1 px-1.5 text-[10px] ${colorClass.split(" ")[0]} ${colorClass.split(" ")[1]}`}
                      >
                        <Icon className="h-2.5 w-2.5" />
                        <span>{t(categoryI18nKey[doc.category])}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[170px]">
                      <DropdownMenuLabel>{t("documents.switchCategory")}</DropdownMenuLabel>
                      {(Object.entries(categoryI18nKey) as [DocumentCategory, string][]).map(([cat], idx) => {
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
                            <div className={`dropdown-item-icon flex h-5 w-5 items-center justify-center rounded ${catColor.split(" ")[0]}`}>
                              <CatIcon className={`h-3 w-3 ${catColor.split(" ")[1]}`} />
                            </div>
                            <span>{t(categoryI18nKey[cat])}</span>
                            {isCurrent && <span className="ml-auto text-[10px] text-brand-500">✓</span>}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="absolute right-3 top-2.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t(doc.isFavorite ? "documents.removeFavorite" : "documents.addFavorite")}
                    onClick={(e) => handleToggleFavorite(e, doc.id)}
                    className={doc.isFavorite ? "text-amber-500" : "text-surface-400"}
                  >
                    <Star className="h-3.5 w-3.5" fill={doc.isFavorite ? "currentColor" : "none"} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    onClick={(e) => handleDeleteClick(e, doc.id)}
                    className="text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
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
