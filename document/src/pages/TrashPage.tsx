import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Scrollbar } from "@/components/ui/scrollbar";
import { LoadingOverlay } from "@/components/LoadingSpinner";
import { useDocuments } from "@/store";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { formatFullDateTime } from "@/lib/date";
import { LoadErrorState } from "@/components/LoadErrorState";

function remainingTrashDays(deletedAt: string | null | undefined) {
  const deletedTime = new Date(deletedAt || Date.now()).getTime();
  return Math.max(0, Math.ceil((deletedTime + 30 * 86400000 - Date.now()) / 86400000));
}

export function TrashPage() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { trash, loading, trashError, refreshTrash, restoreFromTrash, permanentlyDelete, emptyTrash } = useDocuments();
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);

  useEffect(() => {
    refreshTrash();
  }, []);

  const handleRestore = async (id: string, title: string) => {
    setActionLoading(true);
    try {
      await restoreFromTrash(id);
      toast(`${t("trash.restored")}: ${title}`, "success");
    } catch (error: any) {
      toast(error.message || t("toast.restoreFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteForever = async (id: string, title: string) => {
    setActionLoading(true);
    try {
      await permanentlyDelete(id);
      toast(`${t("trash.deleted")}: ${title}`, "error");
    } catch (error: any) {
      toast(error.message || t("toast.deleteFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    setActionLoading(true);
    try {
      await emptyTrash();
      toast(t("trash.deleted"), "error");
    } catch (error: any) {
      toast(error.message || t("toast.emptyFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950 relative">
      {(loading || actionLoading) && (
        <LoadingOverlay
          tone="quiet"
          message={loading ? t("loading.trash") : t("loading.documentAction")}
        />
      )}
      <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100">
              {t("trash.title")}
            </h2>
            <p className="mt-2 text-sm text-surface-500">{t("trash.subtitle")}</p>
          </div>
          {trash.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEmptyTrashConfirm(true)}
              className="gap-2 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 dark:border-red-900 dark:hover:border-red-800"
            >
              <Trash2 className="h-4 w-4" />
              {t("trash.emptyTrash")}
            </Button>
          )}
        </div>

        {trashError ? (
          <LoadErrorState message={trashError} onRetry={() => void refreshTrash()} />
        ) : trash.length > 0 ? (
          <div className="flex flex-col gap-2">
            {trash.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-xl border border-surface-200 bg-white px-5 py-4 transition-colors hover:border-surface-300 dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-950 dark:text-red-400">
                  <Trash2 className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-surface-900 truncate dark:text-surface-100">{item.title}</h4>
                  <p className="mt-0.5 text-xs text-surface-500 truncate">{item.preview}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-surface-400">
                    <span>{formatFullDateTime(item.deletedAt, lang)}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-amber-500">
                      <AlertTriangle className="h-3 w-3" />
                      {remainingTrashDays(item.deletedAt) === 0
                        ? t("trash.expiresToday")
                        : `${remainingTrashDays(item.deletedAt)} ${t("trash.daysLeft")}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleRestore(item.id, item.title)} className="gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="text-xs">{t("trash.restore")}</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(item.id)} className="gap-1.5 text-red-500 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="text-xs">{t("trash.deleteForever")}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-surface-200 bg-white px-6 py-12 text-center dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-100 dark:bg-surface-800">
              <Trash2 className="h-8 w-8 text-surface-300 dark:text-surface-600" />
            </div>
            <h3 className="text-lg font-semibold text-surface-700 dark:text-surface-300">{t("trash.empty")}</h3>
            <p className="mt-1 text-sm text-surface-400">{t("trash.emptyDesc")}</p>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("trash.deleteForever")}
        description={t("trash.confirmDelete")}
        confirmLabel={t("trash.deleteForever")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) {
            const doc = trash.find((d) => d.id === deleteTarget);
            handleDeleteForever(deleteTarget, doc?.title || "");
          }
          setDeleteTarget(null);
        }}
      />

      <ConfirmModal
        open={emptyTrashConfirm}
        onOpenChange={setEmptyTrashConfirm}
        title={t("trash.emptyTrash")}
        description={t("trash.confirmEmpty")}
        confirmLabel={t("trash.emptyTrash")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleEmptyTrash}
      />
    </Scrollbar>
  );
}
