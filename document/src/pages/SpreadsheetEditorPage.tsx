import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { api } from "@/api";
import { SpreadsheetFindReplace } from "@/components/spreadsheet/SpreadsheetFindReplace";
import { SpreadsheetFormulaBar, type SpreadsheetFormulaBarState } from "@/components/spreadsheet/SpreadsheetFormulaBar";
import { SheetTabs } from "@/components/spreadsheet/SheetTabs";
import { SpreadsheetGrid, type SheetChangeOptions, type SpreadsheetActiveCellState, type SpreadsheetGridHandle } from "@/components/spreadsheet/SpreadsheetGrid";
import { SpreadsheetStatusBar } from "@/components/spreadsheet/SpreadsheetStatusBar";
import { SpreadsheetToolbar, type SpreadsheetSaveStatus } from "@/components/spreadsheet/SpreadsheetToolbar";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  findSpreadsheetMatches,
  replaceAllSpreadsheetMatches,
  replaceSpreadsheetMatch,
} from "@/lib/spreadsheetFindReplace";
import type { SpreadsheetSelectionSummary } from "@/lib/spreadsheetSelectionStats";
import {
  addSpreadsheetSheet,
  createDefaultWorkbook,
  deleteSpreadsheetSheet,
  duplicateSpreadsheetSheet,
  moveSpreadsheetSheet,
  validateSpreadsheetWorkbook,
  renameSpreadsheetSheet,
} from "@/lib/spreadsheetWorkbook";
import {
  CSV_MIME,
  workbookFromCsvText,
  workbookFromXlsxArrayBuffer,
  workbookToCsvText,
  workbookToXlsxBlob,
} from "@/lib/spreadsheetImportExport";
import type {
  Spreadsheet,
  SpreadsheetCellColor,
  SpreadsheetFontSize,
  SpreadsheetHorizontalAlign,
  SpreadsheetNumberFormat,
  SpreadsheetSheet,
  SpreadsheetVerticalAlign,
  SpreadsheetWorkbook,
} from "@/types";

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
  const csvInputRef = useRef<HTMLInputElement>(null);
  const changeVersionRef = useRef(0);
  const spreadsheetRef = useRef<Spreadsheet | null>(null);
  const workbookRef = useRef<SpreadsheetWorkbook | null>(null);
  const titleRef = useRef("");
  const saveTimerRef = useRef<number | null>(null);
  const saveWorkbookRef = useRef<() => Promise<void>>(async () => {});
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook | null>(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<SpreadsheetSaveStatus>("saved");
  const [formulaBarState, setFormulaBarState] = useState<SpreadsheetFormulaBarState>({
    cellLabel: "A1",
    value: "",
  });
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [activeFindIndex, setActiveFindIndex] = useState(0);
  const [selectionSummary, setSelectionSummary] = useState<SpreadsheetSelectionSummary | null>(null);

  const visibleWorkbook = workbookRef.current || workbook;
  const activeSheet = visibleWorkbook
    ? visibleWorkbook.sheets.find((sheet) => sheet.id === visibleWorkbook.activeSheetId) || visibleWorkbook.sheets[0] || null
    : null;
  const findMatches = useMemo(
    () => (activeSheet ? findSpreadsheetMatches(activeSheet, findQuery) : []),
    [activeSheet, findQuery]
  );

  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveWorkbookRef.current();
    }, 1200);
  }, []);

  const markUnsaved = useCallback(() => {
    changeVersionRef.current += 1;
    setStatus("unsaved");
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const replaceWorkbook = useCallback((nextWorkbook: SpreadsheetWorkbook, options?: SheetChangeOptions) => {
    workbookRef.current = nextWorkbook;
    if (options?.render !== false) {
      setWorkbook(nextWorkbook);
    }
    markUnsaved();
  }, [markUnsaved]);

  const updateActiveSheet = useCallback((sheet: SpreadsheetSheet, options?: SheetChangeOptions) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    replaceWorkbook({
      ...currentWorkbook,
      sheets: currentWorkbook.sheets.map((item) => (item.id === sheet.id ? sheet : item)),
    }, options);
  }, [replaceWorkbook, workbook]);

  const handleActiveCellChange = useCallback((state: SpreadsheetActiveCellState) => {
    setFormulaBarState({
      cellLabel: state.cellLabel,
      value: state.value,
    });
  }, []);

  const handleNavigateToCell = useCallback((address: string) => {
    return gridRef.current?.navigateToCell(address) ?? false;
  }, []);

  const handleCommitFormulaValue = useCallback((value: string) => {
    gridRef.current?.setActiveCellValue(value);
  }, []);

  const handlePreviousFindMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setActiveFindIndex((index) => (index <= 0 ? findMatches.length - 1 : index - 1));
  }, [findMatches.length]);

  const handleNextFindMatch = useCallback(() => {
    if (findMatches.length === 0) return;
    setActiveFindIndex((index) => (index + 1) % findMatches.length);
  }, [findMatches.length]);

  const handleReplaceCurrent = useCallback(() => {
    if (!activeSheet || findMatches.length === 0) return;
    const match = findMatches[Math.min(activeFindIndex, findMatches.length - 1)];
    updateActiveSheet(replaceSpreadsheetMatch(activeSheet, match, replaceValue));
  }, [activeFindIndex, activeSheet, findMatches, replaceValue, updateActiveSheet]);

  const handleReplaceAll = useCallback(() => {
    if (!activeSheet || findMatches.length === 0) return;
    const result = replaceAllSpreadsheetMatches(activeSheet, findQuery, replaceValue);
    if (result.count === 0) return;
    updateActiveSheet(result.sheet);
    toast(t("sheets.replacedCount").replace("{count}", String(result.count)), "success");
  }, [activeSheet, findMatches.length, findQuery, replaceValue, t, toast, updateActiveSheet]);

  const applyLoadedSpreadsheet = useCallback((nextSpreadsheet: Spreadsheet) => {
    const nextWorkbook = validateSpreadsheetWorkbook(nextSpreadsheet.data)
      ? nextSpreadsheet.data
      : createDefaultWorkbook(t("sheets.defaultSheetName"));
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    spreadsheetRef.current = nextSpreadsheet;
    workbookRef.current = nextWorkbook;
    titleRef.current = nextSpreadsheet.title;
    setWorkbook(nextWorkbook);
    setTitle(nextSpreadsheet.title);
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
    const currentSpreadsheet = spreadsheetRef.current;
    const currentWorkbook = workbookRef.current;
    if (!currentSpreadsheet || !currentWorkbook) return;
    const version = changeVersionRef.current;
    setStatus("saving");
    try {
      const res = await api.updateSpreadsheet(currentSpreadsheet.id, {
        title: titleRef.current.trim() || t("sheets.defaultName"),
        data: currentWorkbook,
      });
      spreadsheetRef.current = res.spreadsheet;
      if (version === changeVersionRef.current) {
        setWorkbook(currentWorkbook);
        setTitle(res.spreadsheet.title);
        titleRef.current = res.spreadsheet.title;
        setStatus("saved");
      }
    } catch (error: any) {
      setStatus("error");
      toast(error.message || t("sheets.saveFailed"), "error");
    }
  }, [t, toast]);

  useEffect(() => {
    saveWorkbookRef.current = saveWorkbook;
  }, [saveWorkbook]);

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

  useEffect(() => () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
  }, []);

  useEffect(() => {
    setFormulaBarState({ cellLabel: "A1", value: "" });
    setSelectionSummary(null);
  }, [activeSheet?.id]);

  useEffect(() => {
    setActiveFindIndex(0);
  }, [activeSheet?.id, findQuery]);

  useEffect(() => {
    if (!findReplaceOpen || findMatches.length === 0) return;
    const match = findMatches[Math.min(activeFindIndex, findMatches.length - 1)];
    gridRef.current?.navigateToCell(match.cellLabel);
  }, [activeFindIndex, findMatches, findReplaceOpen]);

  const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value;
    titleRef.current = nextTitle;
    setTitle(nextTitle);
    markUnsaved();
  };

  const handleSelectSheet = (sheetId: string) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook || currentWorkbook.activeSheetId === sheetId) return;
    replaceWorkbook({ ...currentWorkbook, activeSheetId: sheetId });
  };

  const handleAddSheet = () => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    replaceWorkbook(addSpreadsheetSheet(currentWorkbook, `${t("sheets.untitled")} ${currentWorkbook.sheets.length + 1}`));
  };

  const handleDeleteSheet = (sheetId: string) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    replaceWorkbook(deleteSpreadsheetSheet(currentWorkbook, sheetId));
  };

  const handleRenameSheet = (sheetId: string, name: string) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    replaceWorkbook(renameSpreadsheetSheet(currentWorkbook, sheetId, name));
  };

  const handleDuplicateSheet = (sheetId: string) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    const sheet = currentWorkbook.sheets.find((item) => item.id === sheetId);
    const copyName = sheet ? `${sheet.name} ${t("sheets.sheetCopySuffix")}` : undefined;
    replaceWorkbook(duplicateSpreadsheetSheet(currentWorkbook, sheetId, copyName));
  };

  const handleMoveSheet = (sheetId: string, direction: -1 | 1) => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    replaceWorkbook(moveSpreadsheetSheet(currentWorkbook, sheetId, direction));
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

  const handleSetVerticalAlign = (verticalAlign: SpreadsheetVerticalAlign) => {
    gridRef.current?.applyCellStyle({ verticalAlign });
  };

  const handleSetNumberFormat = (numberFormat: SpreadsheetNumberFormat) => {
    gridRef.current?.applyCellStyle({ numberFormat });
  };

  const handleSetFontSize = (fontSize: SpreadsheetFontSize) => {
    gridRef.current?.applyCellStyle({ fontSize });
  };

  const handleToggleBorder = () => {
    gridRef.current?.applyCellStyle({}, { toggleKey: "border" });
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
    if (importing) return;
    fileInputRef.current?.click();
  };

  const handleImportCsvClick = () => {
    if (importing) return;
    csvInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const importedWorkbook = workbookFromXlsxArrayBuffer(await file.arrayBuffer());
      replaceWorkbook(importedWorkbook);
      toast(t("sheets.importSuccess"), "success");
    } catch (error: any) {
      toast(error.message || t("sheets.importFailed"), "error");
    } finally {
      setImporting(false);
    }
  };

  const handleImportCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    try {
      const sheetName = file.name.replace(/\.[^/.]+$/, "") || t("sheets.defaultSheetName");
      replaceWorkbook(workbookFromCsvText(await file.text(), sheetName));
      toast(t("sheets.importSuccess"), "success");
    } catch (error: any) {
      toast(error.message || t("sheets.importFailed"), "error");
    } finally {
      setImporting(false);
    }
  };

  const handleExport = () => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    const blob = workbookToXlsxBlob(currentWorkbook);
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

  const handleExportCsv = () => {
    const currentWorkbook = workbookRef.current || workbook;
    if (!currentWorkbook) return;
    const blob = new Blob([`\uFEFF${workbookToCsvText(currentWorkbook)}`], { type: CSV_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(title || t("sheets.defaultName"))}.csv`;
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
          <Input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportCsvFile}
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
          />
        </header>

        <SpreadsheetToolbar
          status={status}
          onImport={handleImportClick}
          onExport={handleExport}
          onImportCsv={handleImportCsvClick}
          onExportCsv={handleExportCsv}
          importing={importing}
          onToggleFindReplace={() => setFindReplaceOpen((open) => !open)}
          onOpenFilterMenu={() => gridRef.current?.openFilterMenu()}
          onClearFilters={() => gridRef.current?.clearFilters()}
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
          onSetVerticalAlign={handleSetVerticalAlign}
          onSetNumberFormat={handleSetNumberFormat}
          onSetFontSize={handleSetFontSize}
          onToggleBorder={handleToggleBorder}
          onClearFormat={() => gridRef.current?.clearSelectedFormats()}
          onInsertRowAbove={handleInsertRowAbove}
          onInsertRowBelow={handleInsertRowBelow}
          onInsertColumnLeft={handleInsertColumnLeft}
          onInsertColumnRight={handleInsertColumnRight}
          onDeleteSelectedRows={handleDeleteSelectedRows}
          onDeleteSelectedColumns={handleDeleteSelectedColumns}
          onClearSelectedCells={handleClearSelectedCells}
          onAutoFitColumns={() => gridRef.current?.autoFitSelectedColumns()}
          onResetColumnWidths={() => gridRef.current?.resetSelectedColumnWidths()}
          onResetRowHeights={() => gridRef.current?.resetSelectedRowHeights()}
          onSortAscending={handleSortAscending}
          onSortDescending={handleSortDescending}
          isTopRowFrozen={!!activeSheet?.fixedRowsTop}
          isFirstColumnFrozen={!!activeSheet?.fixedColumnsLeft}
          isFindReplaceOpen={findReplaceOpen}
        />

        <SpreadsheetFormulaBar
          state={formulaBarState}
          onNavigateToCell={handleNavigateToCell}
          onCommitFormulaValue={handleCommitFormulaValue}
        />

        {findReplaceOpen && (
          <SpreadsheetFindReplace
            query={findQuery}
            replacement={replaceValue}
            matches={findMatches}
            activeIndex={activeFindIndex}
            onQueryChange={setFindQuery}
            onReplacementChange={setReplaceValue}
            onPrevious={handlePreviousFindMatch}
            onNext={handleNextFindMatch}
            onReplaceCurrent={handleReplaceCurrent}
            onReplaceAll={handleReplaceAll}
          />
        )}

        <section className="min-h-0 flex-1 bg-white dark:bg-surface-950">
          {loading || !activeSheet ? (
            <div className="flex h-full items-center justify-center text-sm text-surface-500 dark:text-surface-400">
              {t("sheets.loading")}
            </div>
          ) : (
            <SpreadsheetGrid
              ref={gridRef}
              sheet={activeSheet}
              onSheetChange={updateActiveSheet}
              onActiveCellChange={handleActiveCellChange}
              onSelectionSummaryChange={setSelectionSummary}
            />
          )}
        </section>

        <SpreadsheetStatusBar summary={selectionSummary} />

        {visibleWorkbook && (
          <SheetTabs
            sheets={visibleWorkbook.sheets}
            activeSheetId={visibleWorkbook.activeSheetId}
            onSelectSheet={handleSelectSheet}
            onAddSheet={handleAddSheet}
            onDeleteSheet={handleDeleteSheet}
            onRenameSheet={handleRenameSheet}
            onDuplicateSheet={handleDuplicateSheet}
            onMoveSheet={handleMoveSheet}
          />
        )}
      </div>
    </main>
  );
}
