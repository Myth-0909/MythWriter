import { useMemo } from "react";
import { useI18n } from "@/components/I18nProvider";
import { resolveSpreadsheetColor } from "@/lib/spreadsheetColors";
import { cn } from "@/lib/utils";
import type { SpreadsheetCellStyle, SpreadsheetSheet, SpreadsheetWorkbook } from "@/types";

const MAX_PREVIEW_ROWS = 24;
const MAX_PREVIEW_COLUMNS = 12;
const MIN_PREVIEW_ROWS = 8;
const MIN_PREVIEW_COLUMNS = 6;

interface SpreadsheetPatchPreviewProps {
  previousWorkbook: SpreadsheetWorkbook;
  nextWorkbook: SpreadsheetWorkbook;
  summary: string;
}

type SheetPair = {
  nextSheet: SpreadsheetSheet;
  previousSheet?: SpreadsheetSheet;
};

type ChangedCellBounds = {
  cells: Set<string>;
  minRow: number;
  minCol: number;
  maxRow: number;
  maxCol: number;
};

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function columnLabel(index: number) {
  let label = "";
  let cursor = index;
  do {
    label = String.fromCharCode(65 + (cursor % 26)) + label;
    cursor = Math.floor(cursor / 26) - 1;
  } while (cursor >= 0);
  return label;
}

function cellText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function activeSheet(workbook: SpreadsheetWorkbook) {
  return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) || workbook.sheets[0];
}

function findPreviousSheet(workbook: SpreadsheetWorkbook, sheet: SpreadsheetSheet) {
  return workbook.sheets.find((item) => item.id === sheet.id) || workbook.sheets.find((item) => item.name === sheet.name);
}

function styleAt(sheet: SpreadsheetSheet | undefined, row: number, col: number) {
  return sheet?.cellStyles?.find((style) => style.row === row && style.col === col);
}

function styleSignature(style: SpreadsheetCellStyle | undefined) {
  if (!style) return "";
  return JSON.stringify({
    bold: !!style.bold,
    italic: !!style.italic,
    underline: !!style.underline,
    textColor: style.textColor || "default",
    fillColor: style.fillColor || "default",
    horizontalAlign: style.horizontalAlign || "left",
    verticalAlign: style.verticalAlign || "top",
    numberFormat: style.numberFormat || "general",
    fontSize: style.fontSize || "normal",
    border: !!style.border,
    wrap: !!style.wrap,
  });
}

function rowWidth(sheet: SpreadsheetSheet | undefined, row: number) {
  return sheet?.data[row]?.length || 0;
}

function hasCellChanged(nextSheet: SpreadsheetSheet, previousSheet: SpreadsheetSheet | undefined, row: number, col: number) {
  if (!previousSheet) return cellText(nextSheet.data[row]?.[col]) !== "" || !!styleAt(nextSheet, row, col);
  return (
    cellText(nextSheet.data[row]?.[col]) !== cellText(previousSheet.data[row]?.[col]) ||
    styleSignature(styleAt(nextSheet, row, col)) !== styleSignature(styleAt(previousSheet, row, col))
  );
}

function collectChangedCells(nextSheet: SpreadsheetSheet, previousSheet: SpreadsheetSheet | undefined): ChangedCellBounds {
  const cells = new Set<string>();
  let minRow = Number.POSITIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxRow = -1;
  let maxCol = -1;
  const rowCount = Math.max(nextSheet.data.length, previousSheet?.data.length || 0);

  for (let row = 0; row < rowCount; row += 1) {
    const colCount = Math.max(rowWidth(nextSheet, row), rowWidth(previousSheet, row));
    for (let col = 0; col < colCount; col += 1) {
      if (!hasCellChanged(nextSheet, previousSheet, row, col)) continue;
      cells.add(cellKey(row, col));
      minRow = Math.min(minRow, row);
      minCol = Math.min(minCol, col);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
  }

  for (const style of [...(nextSheet.cellStyles || []), ...(previousSheet?.cellStyles || [])]) {
    if (!hasCellChanged(nextSheet, previousSheet, style.row, style.col)) continue;
    cells.add(cellKey(style.row, style.col));
    minRow = Math.min(minRow, style.row);
    minCol = Math.min(minCol, style.col);
    maxRow = Math.max(maxRow, style.row);
    maxCol = Math.max(maxCol, style.col);
  }

  return { cells, minRow, minCol, maxRow, maxCol };
}

function sheetHasChanges(nextSheet: SpreadsheetSheet, previousSheet: SpreadsheetSheet | undefined) {
  if (!previousSheet || nextSheet.name !== previousSheet.name) return true;
  return collectChangedCells(nextSheet, previousSheet).cells.size > 0;
}

function previewSheetPair(previousWorkbook: SpreadsheetWorkbook, nextWorkbook: SpreadsheetWorkbook): SheetPair {
  const changedSheet = nextWorkbook.sheets.find((sheet) => sheetHasChanges(sheet, findPreviousSheet(previousWorkbook, sheet)));
  const nextSheet = changedSheet || activeSheet(nextWorkbook);
  return {
    nextSheet,
    previousSheet: findPreviousSheet(previousWorkbook, nextSheet),
  };
}

function usedBounds(sheet: SpreadsheetSheet, changes: ChangedCellBounds) {
  let maxRow = Math.max(changes.maxRow, MIN_PREVIEW_ROWS - 1);
  let maxCol = Math.max(changes.maxCol, MIN_PREVIEW_COLUMNS - 1);

  sheet.data.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cellText(cell) === "") return;
      maxRow = Math.max(maxRow, rowIndex);
      maxCol = Math.max(maxCol, colIndex);
    });
  });

  for (const style of sheet.cellStyles || []) {
    maxRow = Math.max(maxRow, style.row);
    maxCol = Math.max(maxCol, style.col);
  }

  const startRow = Number.isFinite(changes.minRow) && changes.minRow >= MAX_PREVIEW_ROWS
    ? Math.max(0, changes.minRow - 2)
    : 0;
  const startCol = Number.isFinite(changes.minCol) && changes.minCol >= MAX_PREVIEW_COLUMNS
    ? Math.max(0, changes.minCol - 2)
    : 0;
  const rowCount = Math.max(MIN_PREVIEW_ROWS, Math.min(MAX_PREVIEW_ROWS, maxRow - startRow + 1));
  const colCount = Math.max(MIN_PREVIEW_COLUMNS, Math.min(MAX_PREVIEW_COLUMNS, maxCol - startCol + 1));

  return { startRow, startCol, rowCount, colCount };
}

function cellClassName(style: SpreadsheetCellStyle | undefined, changed: boolean) {
  return cn(
    "min-w-[96px] max-w-[220px] border-b border-r border-surface-200 px-2.5 py-2 text-left text-xs leading-5 text-surface-800 dark:border-surface-700 dark:text-surface-100",
    style?.bold && "font-semibold",
    style?.italic && "italic",
    style?.underline && "underline",
    style?.wrap ? "whitespace-pre-wrap" : "truncate whitespace-nowrap",
    style?.horizontalAlign === "center" && "text-center",
    style?.horizontalAlign === "right" && "text-right",
    style?.horizontalAlign === "justify" && "text-justify",
    style?.verticalAlign === "top" && "align-top",
    style?.verticalAlign === "middle" && "align-middle",
    style?.verticalAlign === "bottom" && "align-bottom",
    style?.fontSize === "small" && "text-[11px]",
    style?.fontSize === "large" && "text-sm",
    style?.border && "ring-1 ring-inset ring-surface-300 dark:ring-surface-600",
    changed && "ring-1 ring-inset ring-emerald-400 dark:ring-emerald-500"
  );
}

function cellStyle(style: SpreadsheetCellStyle | undefined) {
  return {
    color: resolveSpreadsheetColor(style?.textColor, "text"),
    backgroundColor: resolveSpreadsheetColor(style?.fillColor, "fill"),
  };
}

export function SpreadsheetPatchPreview({ previousWorkbook, nextWorkbook, summary }: SpreadsheetPatchPreviewProps) {
  const { t } = useI18n();
  const { nextSheet, previousSheet } = useMemo(
    () => previewSheetPair(previousWorkbook, nextWorkbook),
    [nextWorkbook, previousWorkbook]
  );
  const changes = useMemo(() => collectChangedCells(nextSheet, previousSheet), [nextSheet, previousSheet]);
  const bounds = useMemo(() => usedBounds(nextSheet, changes), [changes, nextSheet]);
  const rows = Array.from({ length: bounds.rowCount }, (_, index) => bounds.startRow + index);
  const columns = Array.from({ length: bounds.colCount }, (_, index) => bounds.startCol + index);
  const summaryLines = summary.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <div className="grid h-full min-h-[340px] grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <section className="min-h-0 overflow-hidden rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-xs font-semibold text-surface-500 dark:text-surface-400">
              {t("ai.spreadsheetPatchSheet")}
            </span>
            <span className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
              {nextSheet.name}
            </span>
          </div>
          {changes.cells.size > 0 && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              {changes.cells.size} {t("ai.spreadsheetPatchChangedCell")}
            </span>
          )}
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-surface-200 bg-white px-2 py-1.5 dark:border-surface-700 dark:bg-surface-900">
          {nextWorkbook.sheets.map((sheet) => (
            <span
              key={sheet.id}
              className={cn(
                "max-w-[180px] truncate rounded-md px-2 py-1 text-[11px] font-medium",
                sheet.id === nextSheet.id
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
              )}
            >
              {sheet.name}
            </span>
          ))}
        </div>

        <div className="h-[300px] overflow-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 w-12 border-b border-r border-surface-200 bg-surface-100 px-2 py-2 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400" />
                {columns.map((col) => (
                  <th
                    key={col}
                    className="min-w-[96px] border-b border-r border-surface-200 bg-surface-100 px-2 py-2 text-center text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400"
                  >
                    {columnLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <th className="sticky left-0 z-10 w-12 border-b border-r border-surface-200 bg-surface-50 px-2 py-2 text-right text-xs font-semibold text-surface-400 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-500">
                    {row + 1}
                  </th>
                  {columns.map((col) => {
                    const style = styleAt(nextSheet, row, col);
                    const changed = changes.cells.has(cellKey(row, col));
                    return (
                      <td
                        key={col}
                        className={cellClassName(style, changed)}
                        style={cellStyle(style)}
                        aria-label={changed ? t("ai.spreadsheetPatchChangedCell") : undefined}
                      >
                        {cellText(nextSheet.data[row]?.[col])}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="min-h-0 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800">
        <div className="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400">
          {t("ai.spreadsheetPatchSummary")}
        </div>
        <div className="space-y-2">
          {summaryLines.length > 0 ? summaryLines.map((line, index) => (
            <div
              key={`${line}-${index}`}
              className="rounded-md border border-emerald-100 bg-white px-3 py-2 text-xs font-medium leading-5 text-emerald-900 dark:border-emerald-900 dark:bg-surface-900 dark:text-emerald-100"
            >
              {line}
            </div>
          )) : (
            <div className="rounded-md border border-surface-200 bg-white px-3 py-2 text-xs text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400">
              {t("ai.spreadsheetPatchEmptyPreview")}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
