import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { api } from "@/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createDefaultWorkbook } from "@/lib/spreadsheetWorkbook";
import { cn } from "@/lib/utils";
import type { Spreadsheet } from "@/types";
import { workbookFromXlsxArrayBuffer } from "@/lib/spreadsheetImportExport";
import { LoadErrorState } from "@/components/LoadErrorState";

interface SpreadsheetCenterPageProps {
  onOpenSpreadsheet: (id: string) => void;
}

function formatSheetCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

export function SpreadsheetCenterPage({ onOpenSpreadsheet }: SpreadsheetCenterPageProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSpreadsheet, setEditingSpreadsheet] = useState<Spreadsheet | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Spreadsheet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadSpreadsheets = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.listSpreadsheets();
      setSpreadsheets(res.spreadsheets || []);
    } catch (error: any) {
      setLoadError(error.message || t("sheets.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    loadSpreadsheets();
  }, [loadSpreadsheets]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return spreadsheets;
    return spreadsheets.filter((sheet) => {
      const haystack = `${sheet.title} ${sheet.preview || ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, spreadsheets]);

  const openCreateDialog = () => {
    setEditingSpreadsheet(null);
    setFormTitle("");
    setDialogOpen(true);
  };

  const openRenameDialog = (spreadsheet: Spreadsheet) => {
    setEditingSpreadsheet(spreadsheet);
    setFormTitle(spreadsheet.title);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = formTitle.trim() || t("sheets.defaultName");

    try {
      if (editingSpreadsheet) {
        const res = await api.updateSpreadsheet(editingSpreadsheet.id, { title });
        setSpreadsheets((items) => items.map((item) => (item.id === res.spreadsheet.id ? res.spreadsheet : item)));
        toast(t("sheets.updated"), "success");
      } else {
        const workbook = createDefaultWorkbook(t("sheets.defaultSheetName"));
        const res = await api.createSpreadsheet({ title, data: workbook });
        setSpreadsheets((items) => [res.spreadsheet, ...items]);
        toast(t("sheets.created"), "success");
        onOpenSpreadsheet(res.spreadsheet.id);
      }
      setDialogOpen(false);
    } catch (error: any) {
      toast(error.message || (editingSpreadsheet ? t("sheets.updateFailed") : t("sheets.createFailed")), "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteSpreadsheet(deleteTarget.id);
      setSpreadsheets((items) => items.filter((item) => item.id !== deleteTarget.id));
      toast(t("sheets.deleted"), "success");
    } catch (error: any) {
      toast(error.message || t("sheets.deleteFailed"), "error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const data = workbookFromXlsxArrayBuffer(await file.arrayBuffer());
      const title = file.name.replace(/\.[^/.]+$/, "") || t("sheets.defaultName");
      const res = await api.createSpreadsheet({ title, data });
      setSpreadsheets((items) => [res.spreadsheet, ...items]);
      toast(t("sheets.importSuccess"), "success");
      onOpenSpreadsheet(res.spreadsheet.id);
    } catch (error: any) {
      toast(error.message || t("sheets.importFailed"), "error");
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-5 dark:bg-surface-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-surface-950 dark:text-surface-50">{t("sheets.title")}</h1>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{t("sheets.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              ref={importInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
            />
            <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={importing} className="gap-2">
              <Upload className="h-4 w-4" />
              {importing ? t("sheets.importing") : t("sheets.importXlsx")}
            </Button>
            <Button type="button" onClick={openCreateDialog} className="gap-2">
              <Plus className="h-4 w-4" />
              {t("sheets.new")}
            </Button>
          </div>
        </header>

        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("sheets.search")}
              className="h-10 pl-9"
            />
          </div>
          {query && (
            <Button type="button" variant="outline" onClick={() => setQuery("")}>
              {t("sheets.searchClear")}
            </Button>
          )}
        </div>

        {loadError && !loading && (
          <LoadErrorState message={loadError} onRetry={() => void loadSpreadsheets()} compact />
        )}

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((spreadsheet) => (
            <article
              key={spreadsheet.id}
              className="flex min-h-[156px] flex-col justify-between rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-surface-950 dark:text-surface-50">
                    {spreadsheet.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 min-h-[36px] text-xs leading-5 text-surface-500 dark:text-surface-400">
                    {spreadsheet.preview || t("sheets.noPreview")}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="truncate text-[11px] text-surface-400">
                  {formatSheetCount(t("sheets.sheetCount"), spreadsheet.data?.sheets?.length || 0)}
                </span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => openRenameDialog(spreadsheet)} aria-label={t("sheets.rename")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(spreadsheet)} aria-label={t("sheets.delete")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" onClick={() => onOpenSpreadsheet(spreadsheet.id)}>
                    {t("sheets.open")}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </section>

        {!loading && !loadError && filtered.length === 0 && (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-surface-300 bg-surface-50 p-8 text-center dark:border-surface-700 dark:bg-surface-900">
            <FileSpreadsheet className="h-10 w-10 text-surface-400" />
            <h2 className="mt-4 text-sm font-semibold text-surface-900 dark:text-surface-100">
              {query ? t("sheets.noResults") : t("sheets.emptyTitle")}
            </h2>
            <p className="mt-2 max-w-md text-xs leading-5 text-surface-500 dark:text-surface-400">{t("sheets.emptyDesc")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={importing} className="gap-2">
                <Upload className="h-4 w-4" />
                {t("sheets.importXlsx")}
              </Button>
              <Button type="button" onClick={openCreateDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                {t("sheets.new")}
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3")}>
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-[156px] animate-pulse rounded-lg bg-surface-100 dark:bg-surface-900" />
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>{editingSpreadsheet ? t("sheets.renameDialogTitle") : t("sheets.createDialogTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("sheets.nameLabel")}</DialogDescription>
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-surface-600 dark:text-surface-300">
              {t("sheets.nameLabel")}
              <Input
                value={formTitle}
                onChange={(event) => setFormTitle(event.target.value)}
                placeholder={t("sheets.namePlaceholder")}
                className="h-9 text-xs"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" size="sm">
                {editingSpreadsheet ? t("common.save") : t("sheets.create")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("sheets.deleteConfirmTitle")}
        description={t("sheets.deleteConfirmDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleDelete}
      />
    </main>
  );
}
