import { useState } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useDocuments } from "@/store";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import {
  FileText, Palette, Lightbulb, Target, Search, Star,
  type LucideIcon,
} from "lucide-react";
import type { DocumentCategory } from "@/types";
import { formatFullDateTime, formatRelativeModified } from "@/lib/date";

const iconByCategory: Record<DocumentCategory, LucideIcon> = {
  design: Palette, journal: Lightbulb, planning: Target, research: Search, general: FileText,
};

const colorByCategory: Record<DocumentCategory, string> = {
  design: "bg-amber-100 text-amber-600", journal: "bg-green-100 text-green-600",
  planning: "bg-red-100 text-red-600", research: "bg-cyan-100 text-cyan-600",
  general: "bg-brand-100 text-brand-600",
};

interface FavoritesPageProps {
  onOpenDoc?: (id: string) => void;
}

export function FavoritesPage({ onOpenDoc }: FavoritesPageProps) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { favorites, moveToTrash } = useDocuments();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const doc = favorites.find((d) => d.id === id);
      await moveToTrash(id);
      toast(`"${doc?.title}" ${t("toast.movedToTrash")}`, "info");
    } catch (error: any) {
      toast(error.message || t("toast.deleteFailed"), "error");
    }
  };

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-6 lg:px-8 lg:py-12 2xl:px-10">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Star className="h-6 w-6 text-amber-500" fill="currentColor" />
            <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100">
              {t("nav.favorites")}
            </h2>
          </div>
          <p className="text-sm text-surface-500">
            {favorites.length > 0 ? `${favorites.length} ${t("favorites.subtitle")}` : t("favorites.emptyDesc")}
          </p>
        </div>

        {favorites.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
            {favorites.map((doc) => (
              <DocumentCard
                key={doc.id}
                title={doc.title}
                preview={doc.preview}
                date={formatRelativeModified(doc.updatedAt, t)}
                fullDate={formatFullDateTime(doc.updatedAt, lang)}
                categoryKey={doc.category === "general" ? "card.general" : `card.${doc.category}` as "card.design"}
                icon={iconByCategory[doc.category]}
                iconBg={colorByCategory[doc.category]}
                onClick={() => onOpenDoc?.(doc.id)}
                onDelete={() => setDeleteTarget(doc.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-200 bg-white px-6 py-12 text-center dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
              <Star className="h-8 w-8 text-surface-300 dark:text-surface-600" />
            </div>
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300">{t("favorites.empty")}</h3>
            <p className="mt-1 text-sm text-surface-400">{t("favorites.emptyDesc")}</p>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </Scrollbar>
  );
}
