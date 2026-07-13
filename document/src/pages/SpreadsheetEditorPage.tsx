import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { api } from "@/api";
import { SheetTabs } from "@/components/spreadsheet/SheetTabs";
import { SpreadsheetGrid, type SpreadsheetGridHandle } from "@/components/spreadsheet/SpreadsheetGrid";
import { SpreadsheetToolbar, type SpreadsheetSaveStatus } from "@/components/spreadsheet/SpreadsheetToolbar";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addSpreadsheetSheet,
  createDefaultWorkbook,
  deleteSpreadsheetSheet,
  validateSpreadsheetWorkbook,
} from "@/lib/spreadsheetWorkbook";
import { workbookFromXlsxArrayBuffer, workbookToXlsxBlob } from "@/lib/spreadsheetImportExport";
import type { Spreadsheet, SpreadsheetCellColor, SpreadsheetHorizontalAlign, SpreadsheetSheet, SpreadsheetWorkbook } from "@/types";

interface SpreadsheetEditorPageProps {
  spreadsheetId: string;
  onBack: () => void;
}

function safeFilename(value: string) {
  return (value || "spreadsheet").replace(/[\\/:*?"<>|]/g, "_");
}

export function SpreadsheetEditorPage({ spreadsheetId, onBack }: SpreadsheetEditorPageProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const gridRef = useRef<SpreadsheetGridHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const changeVersionRef = useRef(0);
  const [spreadsheet, setSpreadsheet] = useState<Spreadsheet | null>(null);
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SpreadsheetSaveStatus>("saved");

  const activeSheet = useMemo(() => {
    if (!workbook) return null;
    return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) || workbook.sheets[0] || null;
  }, [workbook]);

  const markUnsaved = () => {
    changeVersionRef.current += 1;
    setDirty(true);
    setStatus("unsaved");
  };

  const replaceWorkbook = (nextWorkbook: SpreadsheetWorkbook) => {
    setWorkbook(nextWorkbook);
    markUnsaved();
  };

  const updateActiveSheet = (sheet: SpreadsheetSheet) => {
    if (!workbook) return;
    replaceWorkbook({
      ...workbook,
      sheets: workbook.sheets.map((item) => (item.id === sheet.id ? sheet : item)),
    });
  };

  const applyLoadedSpreadsheet = useCallback((nextSpreadsheet: Spreadsheet) => {
    const nextWorkbook = validateSpreadsheetWorkbook(nextSpreadsheet.data)
      ? nextSpreadsheet.data
      : createDefaultWorkbook(t("sheets.defaultSheetName"));
    setSpreadsheet(nextSpreadsheet);
    setWorkbook(nextWorkbook);
    setTitle(nextSpreadsheet.title);
    setDirty(false);
    setStatus("saved");
  }, [t]);

  const loadSpreadsheet = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getSpreadsheet(spreadsheetId);
      applyLoadedSpreadsheet(res.spreadsheet);
    } catch (error: any) {
      toast(error.message || t("sheets.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [applyLoadedSpreadsheet, spreadsheetId, t, toast]);

  const saveWorkbook = useCallback(async () => {
    if (!spreadsheet || !workbook) return;
    const version = changeVersionRef.current;
    setStatus("saving");
    try {
      const res = await api.updateSpreadsheet(spreadsheet.id, {
        title: title.trim() || t("sheets.defaultName"),
        data: workbook,
      });
      setSpreadsheet(res.spreadsheet);
      setTitle(res.spreadsheet.title);
      if (version === changeVersionRef.current) {
        setDirty(false);
        setStatus("saved");
      }
    } catch (error: any) {
      setStatus("error");
      toast(error.message || t("sheets.saveFailed"), "error");
    }
  }, [spreadsheet, t, title, toast, workbook]);

  useEffect(() => {
    loadSpreadsheet();
  }, [loadSpreadsheet]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; spreadsheet?: Spreadsheet }>).detail;
      if (detail?.id !== spreadsheetId) return;
      if (detail.spreadsheet) {
        applyLoadedSpreadsheet(detail.spreadsheet);
        return;
      }
      void loadSpreadsheet();
    };
    window.addEventListener("spreadsheet:updated", handler);
    return () => window.removeEventListener("spreadsheet:updated", handler);
  }, [applyLoadedSpreadsheet, loadSpreadsheet, spreadsheetId]);

  useEffect(() => {
    if (!dirty || !spreadsheet || !workbook) return;
    const timer = window.setTimeout(() => {
      void saveWorkbook();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, saveWorkbook, spreadsheet, workbook]);

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTitle(event.target.value);
    markUnsaved();
  };

  const handleSelectSheet = (sheetId: string) => {
    if (!workbook || workbook.activeSheetId === sheetId) return;
    replaceWorkbook({ ...workbook, activeSheetId: sheetId });
  };

  const handleAddSheet = () => {
    if (!workbook) return;
    replaceWorkbook(addSpreadsheetSheet(workbook, `${t("sheets.untitled")} ${workbook.sheets.length + 1}`));
  };

  const handleDeleteSheet = (sheetId: string) => {
    if (!workbook) return;
    replaceWorkbook(deleteSpreadsheetSheet(workbook, sheetId));
  };

  const toggleFreezeTopRow = () => {
    if (!activeSheet) return;
    updateActiveSheet({ ...activeSheet, fixedRowsTop: activeSheet.fixedRowsTop ? 0 : 1 });
  };

  const toggleFreezeFirstColumn = () => {
    if (!activeSheet) return;
    updateActiveSheet({ ...activeSheet, fixedColumnsLeft: activeSheet.fixedColumnsLeft ? 0 : 1 });
  };

  const handleToggleBold = () => {
    gridRef.current?.applyCellStyle({}, { toggleKey: "bold" });
  };

  const handleToggleItalic = () => {
    gridRef.current?.applyCellStyle({}, { toggleKey: "italic" });
  };

  const handleToggleUnderline = () => {
    gridRef.current?.applyCellStyle({}, { toggleKey: "underline" });
  };

  const handleToggleWrap = () => {
    gridRef.current?.applyCellStyle({}, { toggleKey: "wrap" });
  };

  const handleSetTextColor = (color: SpreadsheetCellColor) => {
    gridRef.current?.applyCellStyle({ textColor: color });
  };

  const handleSetFillColor = (color: SpreadsheetCellColor) => {
    gridRef.current?.applyCellStyle({ fillColor: color });
  };

  const handleSetHorizontalAlign = (horizontalAlign: SpreadsheetHorizontalAlign) => {
    gridRef.current?.applyCellStyle({ horizontalAlign });
  };

  const handleInsertRowAbove = () => {
    gridRef.current?.insertRowAbove();
  };

  const handleInsertRowBelow = () => {
    gridRef.current?.insertRowBelow();
  };

  const handleInsertColumnLeft = () => {
    gridRef.current?.insertColumnLeft();
  };

  const handleInsertColumnRight = () => {
    gridRef.current?.insertColumnRight();
  };

  const handleDeleteSelectedRows = () => {
    gridRef.current?.deleteSelectedRows();
  };

  const handleDeleteSelectedColumns = () => {
    gridRef.current?.deleteSelectedColumns();
  };

  const handleClearSelectedCells = () => {
    gridRef.current?.clearSelectedCells();
  };

  const handleSortAscending = () => {
    gridRef.current?.sortSelectedColumn("asc");
  };

  const handleSortDescending = () => {
    gridRef.current?.sortSelectedColumn("desc");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const importedWorkbook = workbookFromXlsxArrayBuffer(await file.arrayBuffer());
      replaceWorkbook(importedWorkbook);
      toast(t("sheets.importSuccess"), "success");
    } catch (error: any) {
      toast(error.message || t("sheets.importFailed"), "error");
    }
  };

  const handleExport = () => {
    if (!workbook) return;
    const blob = workbookToXlsxBlob(workbook);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(title || t("sheets.defaultName"))}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(t("sheets.downloaded"), "success");
  };

  return (
    <main className="min-h-0 flex-1 overflow-hidden bg-white dark:bg-surface-950">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-surface-200 px-4 dark:border-surface-800">
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t("common.back")}
          </Button>
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
          <Input
            value={title}
            onChange={handleTitleChange}
            aria-label={t("sheets.nameLabel")}
            className="h-9 max-w-[420px] border-transparent bg-transparent px-2 text-sm font-semibold shadow-none hover:border-surface-200 focus-visible:border-surface-300 dark:hover:border-surface-700"
            placeholder={t("sheets.namePlaceholder")}
          />
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />
        </header>

        <SpreadsheetToolbar
          status={status}
          canSave={!!workbook && (dirty || status === "error")}
          onSave={() => void saveWorkbook()}
          onImport={handleImportClick}
          onExport={handleExport}
          onUndo={() => gridRef.current?.undo()}
          onRedo={() => gridRef.current?.redo()}
          onMerge={() => gridRef.current?.mergeSelected()}
          onUnmerge={() => gridRef.current?.unmergeSelected()}
          onToggleFreezeTopRow={toggleFreezeTopRow}
          onToggleFreezeFirstColumn={toggleFreezeFirstColumn}
          onToggleBold={handleToggleBold}
          onToggleItalic={handleToggleItalic}
          onToggleUnderline={handleToggleUnderline}
          onToggleWrap={handleToggleWrap}
          onSetTextColor={handleSetTextColor}
          onSetFillColor={handleSetFillColor}
          onSetHorizontalAlign={handleSetHorizontalAlign}
          onInsertRowAbove={handleInsertRowAbove}
          onInsertRowBelow={handleInsertRowBelow}
          onInsertColumnLeft={handleInsertColumnLeft}
          onInsertColumnRight={handleInsertColumnRight}
          onDeleteSelectedRows={handleDeleteSelectedRows}
          onDeleteSelectedColumns={handleDeleteSelectedColumns}
          onClearSelectedCells={handleClearSelectedCells}
          onSortAscending={handleSortAscending}
          onSortDescending={handleSortDescending}
          isTopRowFrozen={!!activeSheet?.fixedRowsTop}
          isFirstColumnFrozen={!!activeSheet?.fixedColumnsLeft}
        />

        <section className="min-h-0 flex-1 bg-white dark:bg-surface-950">
          {loading || !activeSheet ? (
            <div className="flex h-full items-center justify-center text-sm text-surface-500 dark:text-surface-400">
              {t("sheets.loading")}
            </div>
          ) : (
            <SpreadsheetGrid ref={gridRef} sheet={activeSheet} onSheetChange={updateActiveSheet} />
          )}
        </section>

        {workbook && (
          <SheetTabs
            sheets={workbook.sheets}
            activeSheetId={workbook.activeSheetId}
            onSelectSheet={handleSelectSheet}
            onAddSheet={handleAddSheet}
            onDeleteSheet={handleDeleteSheet}
          />
        )}
      </div>
    </main>
  );
}
