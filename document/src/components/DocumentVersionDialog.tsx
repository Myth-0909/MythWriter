import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Scrollbar } from "@/components/ui/scrollbar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useDocuments } from "@/store";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { formatFullDateTime } from "@/lib/date";
import type { DocumentVersion } from "@/types";

export function DocumentVersionDialog({
  open,
  onOpenChange,
  documentId,
  flushCurrent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  flushCurrent: () => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { listDocumentVersions, createDocumentVersion, restoreDocumentVersion } = useDocuments();
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<DocumentVersion | null>(null);

  const loadVersions = async () => {
    setLoading(true);
    try {
      setVersions(await listDocumentVersions(documentId));
    } catch (error: any) {
      toast(error.message || t("ai.versionLoadFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadVersions();
  }, [open, documentId]);

  const saveCurrentVersion = async () => {
    setSaving(true);
    try {
      if (!await flushCurrent()) return;
      const version = await createDocumentVersion(documentId, "manual");
      if (!version) throw new Error(t("editor.versionSaveFailed"));
      setVersions((items) => [version, ...items]);
      toast(t("editor.versionSaved"), "success");
    } catch (error: any) {
      toast(error.message || t("editor.versionSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!restoreTarget) return;
    setSaving(true);
    try {
      if (!await flushCurrent()) return;
      const restored = await restoreDocumentVersion(documentId, restoreTarget.id);
      if (!restored) throw new Error(t("editor.versionRestoreFailed"));
      toast(t("editor.versionRestored"), "success");
      setRestoreTarget(null);
      onOpenChange(false);
    } catch (error: any) {
      toast(error.message || t("editor.versionRestoreFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = (source: string) => {
    if (source === "ai_edit") return t("editor.versionSourceAi");
    if (source === "restore") return t("editor.versionSourceRestore");
    return t("editor.versionSourceManual");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[620px]">
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                {t("editor.versionHistory")}
              </DialogTitle>
              <DialogDescription className="mt-2">{t("editor.versionHistoryDesc")}</DialogDescription>
            </div>
            <Button type="button" size="sm" onClick={() => void saveCurrentVersion()} disabled={saving} className="shrink-0 gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("editor.saveVersion")}
            </Button>
          </div>

          <Scrollbar className="max-h-[420px] pr-2">
            <div className="space-y-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-14 text-sm text-surface-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("loading.versions")}
                </div>
              ) : versions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-300 px-5 py-12 text-center text-sm text-surface-500 dark:border-surface-700">
                  {t("editor.versionEmpty")}
                </div>
              ) : versions.map((version) => (
                <article key={version.id} className="flex items-center gap-4 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 dark:border-surface-800 dark:bg-surface-950">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{version.title}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-surface-500">
                      <span>{sourceLabel(version.source)}</span>
                      <span>{formatFullDateTime(version.createdAt, lang)}</span>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setRestoreTarget(version)} disabled={saving} className="shrink-0 gap-2">
                    <RotateCcw className="h-4 w-4" />
                    {t("editor.restoreVersion")}
                  </Button>
                </article>
              ))}
            </div>
          </Scrollbar>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!restoreTarget}
        onOpenChange={(nextOpen) => !nextOpen && setRestoreTarget(null)}
        title={t("editor.restoreVersion")}
        description={t("editor.versionRestoreConfirm")}
        confirmLabel={t("editor.restoreVersion")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void restore()}
      />
    </>
  );
}
