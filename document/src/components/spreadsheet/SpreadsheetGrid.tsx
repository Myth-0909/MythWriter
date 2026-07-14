import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { HotTable, type HotTableRef } from "@handsontable/react-wrapper";
import { enUS, registerLanguageDictionary, zhCN } from "handsontable/i18n";
import { registerAllModules } from "handsontable/registry";
import HyperFormula from "hyperformula";
import type Handsontable from "handsontable";
import { useI18n } from "@/components/I18nProvider";
import type {
  SpreadsheetCellStyle,
  SpreadsheetCellValue,
  SpreadsheetHorizontalAlign,
  SpreadsheetMergeCell,
  SpreadsheetSheet,
  SpreadsheetVerticalAlign,
} from "@/types";
import { applySpreadsheetCellChanges, type SpreadsheetCellChange } from "@/lib/spreadsheetPerformance";
import { normalizeSpreadsheetColor, resolveSpreadsheetColor } from "@/lib/spreadsheetColors";
import { formatSpreadsheetCellDisplay } from "@/lib/spreadsheetFormatting";
import {
  buildSpreadsheetSelectionSummary,
  type SpreadsheetSelectionSummary,
} from "@/lib/spreadsheetSelectionStats";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import "./spreadsheet.css";

let modulesRegistered = false;

function ensureHandsontableModules() {
  if (modulesRegistered) return;
  registerAllModules();
  registerLanguageDictionary(enUS);
  registerLanguageDictionary(zhCN);
  modulesRegistered = true;
}

ensureHandsontableModules();

type CellStylePatch = Partial<Omit<SpreadsheetCellStyle, "row" | "col">>;
type ToggleCellStyleKey = "bold" | "italic" | "underline" | "wrap" | "border";
const DEFAULT_ROW_HEIGHT = 30;
const MIN_ROW_HEIGHT = 30;
const MAX_ROW_HEIGHT = 320;

export interface SpreadsheetActiveCellState {
  row: number;
  col: number;
  cellLabel: string;
  value: string;
}

export interface SpreadsheetGridHandle {
  undo: () => void;
  redo: () => void;
  getActiveCellState: () => SpreadsheetActiveCellState | null;
  navigateToCell: (address: string) => boolean;
  setActiveCellValue: (value: string) => void;
  openFilterMenu: () => void;
  clearFilters: () => void;
  clearSelectedFormats: () => void;
  mergeSelected: () => void;
  unmergeSelected: () => void;
  applyCellStyle: (patch: CellStylePatch, options?: { toggleKey?: ToggleCellStyleKey }) => void;
  insertRowAbove: () => void;
  insertRowBelow: () => void;
  insertColumnLeft: () => void;
  insertColumnRight: () => void;
  deleteSelectedRows: () => void;
  deleteSelectedColumns: () => void;
  clearSelectedCells: () => void;
  autoFitSelectedColumns: () => void;
  resetSelectedColumnWidths: () => void;
  setSelectedRowHeight: (height: number) => void;
  resetSelectedRowHeights: () => void;
  sortSelectedColumn: (direction: "asc" | "desc") => void;
}

export type SheetChangeOptions = {
  render?: boolean;
};

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  onSheetChange: (sheet: SpreadsheetSheet, options?: SheetChangeOptions) => void;
  onActiveCellChange?: (state: SpreadsheetActiveCellState) => void;
  onSelectionSummaryChange?: (summary: SpreadsheetSelectionSummary) => void;
}

interface CellCoord {
  row: number;
  col: number;
}

interface SelectionBounds {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

type SelectionTuple = [number, number, number, number];

function isUsableSelectionTuple(selection: SelectionTuple) {
  return (
    selection.every((value) => Number.isInteger(value) && value >= -1) &&
    selection.some((value) => value >= 0)
  );
}

function getAxisSelectionBounds(a: number, b: number, count: number) {
  if (a < 0 && b < 0) return { start: 0, end: count - 1 };
  const start = Math.max(0, Math.min(a, b));
  const end = Math.min(count - 1, Math.max(a, b));
  return start <= end ? { start, end } : null;
}

function selectionTupleToBounds(selection: SelectionTuple, rowCount: number, colCount: number): SelectionBounds | null {
  if (!isUsableSelectionTuple(selection)) return null;
  const [rowA, colA, rowB, colB] = selection;
  const rowBounds = getAxisSelectionBounds(rowA, rowB, rowCount);
  const colBounds = getAxisSelectionBounds(colA, colB, colCount);
  if (!rowBounds || !colBounds) return null;

  return {
    startRow: rowBounds.start,
    endRow: rowBounds.end,
    startCol: colBounds.start,
    endCol: colBounds.end,
  };
}

function updateIndexedValue(values: number[] | undefined, index: number, value: number) {
  const next = [...(values || [])];
  next[index] = value;
  return next;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRowHeight(height: number) {
  if (!Number.isFinite(height)) return DEFAULT_ROW_HEIGHT;
  return clamp(Math.round(height), MIN_ROW_HEIGHT, MAX_ROW_HEIGHT);
}

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

function parseCellAddress(value: string): CellCoord | null {
  const match = value.trim().match(/^([A-Z]+)([1-9]\d*)$/i);
  if (!match) return null;
  const columnLetters = match[1].toUpperCase();
  let col = 0;
  for (const letter of columnLetters) {
    col = col * 26 + letter.charCodeAt(0) - 64;
  }
  return { row: Number(match[2]) - 1, col: col - 1 };
}

function readCellRawValue(hot: Handsontable, row: number, col: number): SpreadsheetCellValue {
  const rawValue = (hot as any).getSourceDataAtCell?.(row, col);
  if (rawValue !== undefined) return rawValue as SpreadsheetCellValue;
  return (hot.getDataAtCell(row, col) ?? null) as SpreadsheetCellValue;
}

function formulaBarText(value: SpreadsheetCellValue) {
  return value === null || value === undefined ? "" : String(value);
}

function readActiveCellState(hot: Handsontable, fallback?: SelectionTuple | null): SpreadsheetActiveCellState | null {
  const rowCount = hot.countRows();
  const colCount = hot.countCols();
  if (rowCount <= 0 || colCount <= 0) return null;

  const selected = (hot.getSelectedLast() as SelectionTuple | null) || fallback;
  const row = selected && selected[0] >= 0 ? Math.min(rowCount - 1, selected[0]) : 0;
  const col = selected && selected[1] >= 0 ? Math.min(colCount - 1, selected[1]) : 0;

  return {
    row,
    col,
    cellLabel: `${columnLabel(col)}${row + 1}`,
    value: formulaBarText(readCellRawValue(hot, row, col)),
  };
}

function activeCellSignature(state: SpreadsheetActiveCellState) {
  return JSON.stringify([state.row, state.col, state.cellLabel, state.value]);
}

function selectionSummarySignature(summary: SpreadsheetSelectionSummary) {
  return JSON.stringify([
    summary.rangeLabel,
    summary.cellCount,
    summary.numberCount,
    summary.sum,
    summary.average,
    summary.min,
    summary.max,
  ]);
}

function readMerges(hot: Handsontable | null | undefined): SpreadsheetMergeCell[] {
  const plugin = hot?.getPlugin("mergeCells") as any;
  const mergedCells = plugin?.mergedCellsCollection?.mergedCells || [];
  return mergedCells.map((cell: any) => ({
    row: cell.row,
    col: cell.col,
    rowspan: cell.rowspan,
    colspan: cell.colspan,
  }));
}

function readData(hot: Handsontable): SpreadsheetCellValue[][] {
  return hot.getData() as SpreadsheetCellValue[][];
}

function horizontalAlignFromClassName(className: string): SpreadsheetHorizontalAlign | undefined {
  if (className.includes("htCenter")) return "center";
  if (className.includes("htRight")) return "right";
  if (className.includes("htJustify")) return "justify";
  if (className.includes("htLeft")) return "left";
  return undefined;
}

function verticalAlignFromClassName(className: string): SpreadsheetVerticalAlign | undefined {
  if (className.includes("htMiddle")) return "middle";
  if (className.includes("htBottom")) return "bottom";
  if (className.includes("htTop")) return "top";
  return undefined;
}

function hasHandsontableAlignmentClass(className: string) {
  return /\bht(?:Left|Center|Right|Justify|Top|Middle|Bottom)\b/.test(className);
}

function isContextMenuSource(source: unknown) {
  return typeof source === "string" && source.startsWith("ContextMenu.");
}

function normalizeCellStyle(style: SpreadsheetCellStyle): SpreadsheetCellStyle | null {
  const next: SpreadsheetCellStyle = {
    row: style.row,
    col: style.col,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(normalizeSpreadsheetColor(style.textColor) ? { textColor: normalizeSpreadsheetColor(style.textColor) } : {}),
    ...(normalizeSpreadsheetColor(style.fillColor) ? { fillColor: normalizeSpreadsheetColor(style.fillColor) } : {}),
    ...(style.horizontalAlign ? { horizontalAlign: style.horizontalAlign } : {}),
    ...(style.verticalAlign ? { verticalAlign: style.verticalAlign } : {}),
    ...(style.numberFormat ? { numberFormat: style.numberFormat } : {}),
    ...(style.fontSize ? { fontSize: style.fontSize } : {}),
    ...(style.border ? { border: true } : {}),
    ...(style.wrap ? { wrap: true } : {}),
  };

  return Object.keys(next).length > 2 ? next : null;
}

function getSelectedBounds(hot: Handsontable, fallback?: SelectionTuple | null): SelectionBounds | null {
  const selected = (hot.getSelectedLast() as SelectionTuple | null) || fallback;
  if (!selected) return null;
  const rowCount = hot.countRows();
  const colCount = hot.countCols();
  if (rowCount <= 0 || colCount <= 0) return null;

  return selectionTupleToBounds(selected, rowCount, colCount);
}

function getSelectedCells(hot: Handsontable, fallback?: SelectionTuple | null): CellCoord[] {
  const ranges = hot.getSelectedRange() || [];
  const rowCount = hot.countRows();
  const colCount = hot.countCols();
  if (rowCount <= 0 || colCount <= 0) return [];

  const cells: CellCoord[] = [];
  const seen = new Set<string>();

  const pushBounds = (bounds: SelectionBounds) => {
    for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
      for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
        const key = cellKey(row, col);
        if (!seen.has(key)) {
          seen.add(key);
          cells.push({ row, col });
        }
      }
    }
  };

  if (ranges.length === 0 && fallback) {
    const bounds = getSelectedBounds(hot, fallback);
    if (bounds) pushBounds(bounds);
    return cells;
  }

  for (const range of ranges as any[]) {
    const bounds = selectionTupleToBounds(
      [range.from.row, range.from.col, range.to.row, range.to.col],
      rowCount,
      colCount
    );
    if (bounds) pushBounds(bounds);
  }

  return cells;
}

function shiftStylesForInsert(
  styles: SpreadsheetCellStyle[] | undefined,
  axis: "row" | "col",
  index: number,
  amount = 1
) {
  return (styles || []).map((style) => ({
    ...style,
    [axis]: style[axis] >= index ? style[axis] + amount : style[axis],
  }));
}

function shiftStylesForDelete(
  styles: SpreadsheetCellStyle[] | undefined,
  axis: "row" | "col",
  index: number,
  amount: number
) {
  return (styles || [])
    .filter((style) => style[axis] < index || style[axis] >= index + amount)
    .map((style) => ({
      ...style,
      [axis]: style[axis] >= index + amount ? style[axis] - amount : style[axis],
    }));
}

function buildCellClassName(style: SpreadsheetCellStyle | undefined) {
  if (!style) return undefined;
  const classes = [
    style.bold && "zn-cell-bold",
    style.italic && "zn-cell-italic",
    style.underline && "zn-cell-underline",
    style.wrap && "zn-cell-wrap",
    style.horizontalAlign && `zn-cell-align-${style.horizontalAlign}`,
    style.verticalAlign && `zn-cell-valign-${style.verticalAlign}`,
    style.fontSize && `zn-cell-font-${style.fontSize}`,
    style.border && "zn-cell-border",
  ].filter(Boolean);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

function restoreStoredSelection(hot: Handsontable, fallback?: SelectionTuple | null) {
  if (!fallback) return;
  if (!isUsableSelectionTuple(fallback)) return;

  const [rowA, colA, rowB, colB] = fallback;
  if (colA < 0 && colB < 0 && rowA >= 0 && rowB >= 0) {
    hot.selectRows(Math.min(rowA, rowB), Math.max(rowA, rowB));
    return;
  }
  if (rowA < 0 && rowB < 0 && colA >= 0 && colB >= 0) {
    hot.selectColumns(Math.min(colA, colB), Math.max(colA, colB));
    return;
  }

  hot.selectCell(
    Math.max(0, rowA),
    Math.max(0, colA),
    Math.max(0, rowB),
    Math.max(0, colB),
    false,
    false
  );
}

function readCellStyleOverridesFromHot(
  hot: Handsontable,
  baseStyles: SpreadsheetCellStyle[] | undefined,
  classNameOverrides?: Map<string, string>
): SpreadsheetCellStyle[] {
  const styles = new Map<string, SpreadsheetCellStyle>();
  for (const style of baseStyles || []) {
    styles.set(cellKey(style.row, style.col), style);
  }

  for (let row = 0; row < hot.countRows(); row += 1) {
    for (let col = 0; col < hot.countCols(); col += 1) {
      const key = cellKey(row, col);
      const className = classNameOverrides?.get(key) ?? String(hot.getCellMeta(row, col).className || "");
      if (!hasHandsontableAlignmentClass(className)) continue;

      const current = styles.get(key) || { row, col };
      const next: SpreadsheetCellStyle = { ...current };
      const horizontalAlign = horizontalAlignFromClassName(className);
      const verticalAlign = verticalAlignFromClassName(className);
      if (horizontalAlign) next.horizontalAlign = horizontalAlign;
      if (verticalAlign) next.verticalAlign = verticalAlign;

      const normalized = normalizeCellStyle(next);
      if (normalized) {
        styles.set(key, normalized);
      } else {
        styles.delete(key);
      }
    }
  }

  return Array.from(styles.values());
}

export const SpreadsheetGrid = forwardRef<SpreadsheetGridHandle, SpreadsheetGridProps>(
  ({ sheet, onSheetChange, onActiveCellChange, onSelectionSummaryChange }, ref) => {
    const { lang } = useI18n();
    const hotRef = useRef<HotTableRef>(null);
    const latestSheetRef = useRef(sheet);
    const lastSelectionRef = useRef<SelectionTuple | null>(null);
    const lastActiveCellSignatureRef = useRef("");
    const lastSelectionSummarySignatureRef = useRef("");
    const contextMenuStyleSyncTimerRef = useRef<number | null>(null);
    const contextMenuInteractionRef = useRef(false);
    const contextMenuInteractionTimerRef = useRef<number | null>(null);
    const delayedContextMenuOpenTimerRef = useRef<number | null>(null);
    const contextMenuClassNameByCoordRef = useRef(new Map<string, string>());
    const formulaEngine = useMemo(
      () => HyperFormula.buildEmpty({ licenseKey: "internal-use-in-handsontable" }),
      []
    );
    const cellStyleByCoord = useMemo(() => {
      const map = new Map<string, SpreadsheetCellStyle>();
      for (const style of sheet.cellStyles || []) {
        map.set(cellKey(style.row, style.col), style);
      }
      return map;
    }, [sheet.cellStyles]);

    useEffect(() => {
      latestSheetRef.current = sheet;
    }, [sheet]);

    useEffect(() => {
      lastActiveCellSignatureRef.current = "";
      lastSelectionSummarySignatureRef.current = "";
    }, [sheet.id]);

    useEffect(() => () => {
      if (contextMenuStyleSyncTimerRef.current !== null) {
        window.clearTimeout(contextMenuStyleSyncTimerRef.current);
      }
      if (contextMenuInteractionTimerRef.current !== null) {
        window.clearTimeout(contextMenuInteractionTimerRef.current);
      }
      if (delayedContextMenuOpenTimerRef.current !== null) {
        window.clearTimeout(delayedContextMenuOpenTimerRef.current);
      }
    }, []);

    const emitSheetChange = (nextSheet: SpreadsheetSheet, options?: SheetChangeOptions) => {
      latestSheetRef.current = nextSheet;
      onSheetChange(nextSheet, options);
    };

    const syncFromHot = (overrides: Partial<SpreadsheetSheet> = {}, options?: SheetChangeOptions) => {
      const hot = hotRef.current?.hotInstance;
      if (!hot) return;
      const currentSheet = latestSheetRef.current;
      emitSheetChange({
        ...currentSheet,
        data: readData(hot),
        cellStyles: currentSheet.cellStyles || [],
        merges: readMerges(hot),
        ...overrides,
      }, options);
    };

    const scheduleCellMetaStyleSync = () => {
      if (contextMenuStyleSyncTimerRef.current !== null) {
        window.clearTimeout(contextMenuStyleSyncTimerRef.current);
      }

      contextMenuStyleSyncTimerRef.current = window.setTimeout(() => {
        contextMenuStyleSyncTimerRef.current = null;
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const classNameOverrides = new Map(contextMenuClassNameByCoordRef.current);
        contextMenuClassNameByCoordRef.current.clear();
        syncFromHot({
          cellStyles: readCellStyleOverridesFromHot(hot, latestSheetRef.current.cellStyles, classNameOverrides),
        });
        hot.render();
      }, 0);
    };

    const notifyActiveCellChange = () => {
      const hot = hotRef.current?.hotInstance;
      if (!hot) return;
      const state = readActiveCellState(hot, lastSelectionRef.current);
      if (!state) return;
      const signature = activeCellSignature(state);
      if (signature === lastActiveCellSignatureRef.current) return;
      lastActiveCellSignatureRef.current = signature;
      onActiveCellChange?.(state);
    };

    const notifySelectionSummaryChange = () => {
      const hot = hotRef.current?.hotInstance;
      if (!hot) return;
      const bounds = getSelectedBounds(hot, lastSelectionRef.current);
      if (bounds) {
        const summary = buildSpreadsheetSelectionSummary(latestSheetRef.current, bounds);
        const signature = selectionSummarySignature(summary);
        if (signature === lastSelectionSummarySignatureRef.current) return;
        lastSelectionSummarySignatureRef.current = signature;
        onSelectionSummaryChange?.(summary);
      }
    };

    function startContextMenuInteraction() {
      contextMenuInteractionRef.current = true;
      if (contextMenuInteractionTimerRef.current !== null) {
        window.clearTimeout(contextMenuInteractionTimerRef.current);
      }
      contextMenuInteractionTimerRef.current = window.setTimeout(() => {
        contextMenuInteractionTimerRef.current = null;
        contextMenuInteractionRef.current = false;
      }, 500);
    }

    function keepContextMenuInteraction() {
      contextMenuInteractionRef.current = true;
      if (contextMenuInteractionTimerRef.current !== null) {
        window.clearTimeout(contextMenuInteractionTimerRef.current);
        contextMenuInteractionTimerRef.current = null;
      }
    }

    function finishContextMenuInteraction() {
      if (contextMenuInteractionTimerRef.current !== null) {
        window.clearTimeout(contextMenuInteractionTimerRef.current);
      }
      contextMenuInteractionTimerRef.current = window.setTimeout(() => {
        contextMenuInteractionTimerRef.current = null;
        contextMenuInteractionRef.current = false;
      }, 120);
    }

    function openContextMenuAfterPointerRelease(event: MouseEvent) {
      const hot = hotRef.current?.hotInstance;
      if (!hot) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startContextMenuInteraction();

      const offset = hot.rootDocument?.documentElement?.getBoundingClientRect?.() || { top: 0, left: 0 };
      const position = {
        top: event.clientY + Math.abs(offset.top || 0),
        left: event.clientX + Math.abs(offset.left || 0),
      };

      if (delayedContextMenuOpenTimerRef.current !== null) {
        window.clearTimeout(delayedContextMenuOpenTimerRef.current);
      }

      delayedContextMenuOpenTimerRef.current = window.setTimeout(() => {
        delayedContextMenuOpenTimerRef.current = null;
        const currentHot = hotRef.current?.hotInstance;
        if (!currentHot) return;
        const plugin = currentHot.getPlugin("contextMenu") as any;
        plugin?.open?.(position);
      }, 80);
    }

    useImperativeHandle(ref, () => ({
      getActiveCellState: () => {
        const hot = hotRef.current?.hotInstance;
        return hot ? readActiveCellState(hot, lastSelectionRef.current) : null;
      },
      navigateToCell: (address) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return false;
        const coord = parseCellAddress(address);
        if (!coord || coord.row >= hot.countRows() || coord.col >= hot.countCols()) return false;
        hot.selectCell(coord.row, coord.col);
        hot.scrollViewportTo(coord.row, coord.col);
        lastSelectionRef.current = [coord.row, coord.col, coord.row, coord.col];
        notifyActiveCellChange();
        return true;
      },
      setActiveCellValue: (value) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const state = readActiveCellState(hot, lastSelectionRef.current);
        if (!state) return;
        hot.setDataAtCell(state.row, state.col, value === "" ? null : value, "formula-bar");
        notifyActiveCellChange();
      },
      openFilterMenu: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const row = bounds?.startRow ?? 0;
        const col = bounds?.startCol ?? 0;
        hot.selectCell(row, col);
        const cell = hot.getCell(row, col, true);
        const rect = cell?.getBoundingClientRect() || hot.rootElement.getBoundingClientRect();
        const plugin = hot.getPlugin("dropdownMenu") as any;
        plugin?.open?.({ top: rect.top, left: rect.left });
      },
      clearFilters: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const plugin = hot.getPlugin("filters") as any;
        plugin?.clearConditions?.();
        plugin?.filter?.();
        hot.render();
      },
      clearSelectedFormats: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const selectedCells = getSelectedCells(hot, lastSelectionRef.current);
        if (selectedCells.length === 0) return;
        const removeKeys = new Set(selectedCells.map((coord) => cellKey(coord.row, coord.col)));
        const nextStyles = (latestSheetRef.current.cellStyles || []).filter((style) => !removeKeys.has(cellKey(style.row, style.col)));
        syncFromHot({ cellStyles: nextStyles });
        hot.render();
      },
      undo: () => {
        const plugin = hotRef.current?.hotInstance?.getPlugin("undoRedo") as any;
        plugin?.undo?.();
      },
      redo: () => {
        const plugin = hotRef.current?.hotInstance?.getPlugin("undoRedo") as any;
        plugin?.redo?.();
      },
      mergeSelected: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const range = hot.getSelectedRangeLast();
        if (!range) return;
        const plugin = hot.getPlugin("mergeCells") as any;
        plugin?.mergeRange?.(range);
        hot.render();
        syncFromHot();
      },
      unmergeSelected: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const range = hot.getSelectedRangeLast();
        if (!range) return;
        const plugin = hot.getPlugin("mergeCells") as any;
        plugin?.unmergeSelection?.(range);
        hot.render();
        syncFromHot();
      },
      applyCellStyle: (patch, options) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const selectedCells = getSelectedCells(hot, lastSelectionRef.current);
        if (selectedCells.length === 0) return;

        const styles = new Map<string, SpreadsheetCellStyle>();
        const currentSheet = latestSheetRef.current;
        for (const style of currentSheet.cellStyles || []) {
          styles.set(cellKey(style.row, style.col), style);
        }

        for (const coord of selectedCells) {
          const key = cellKey(coord.row, coord.col);
          const current = styles.get(key) || { row: coord.row, col: coord.col };
          const next = {
            ...current,
            ...patch,
          };
          if (options?.toggleKey) {
            next[options.toggleKey] = !current[options.toggleKey];
          }
          const normalized = normalizeCellStyle(next);
          if (normalized) {
            styles.set(key, normalized);
          } else {
            styles.delete(key);
          }
        }

        syncFromHot({ cellStyles: Array.from(styles.values()) });
        restoreStoredSelection(hot, lastSelectionRef.current);
        hot.render();
      },
      insertRowAbove: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds?.startRow ?? 0;
        (hot as any).alter("insert_row_above", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "row", index) });
      },
      insertRowBelow: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds ? bounds.endRow + 1 : hot.countRows();
        (hot as any).alter("insert_row_above", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "row", index) });
      },
      insertColumnLeft: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds?.startCol ?? 0;
        (hot as any).alter("insert_col_start", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "col", index) });
      },
      insertColumnRight: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds ? bounds.endCol + 1 : hot.countCols();
        (hot as any).alter("insert_col_start", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "col", index) });
      },
      deleteSelectedRows: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const amount = bounds.endRow - bounds.startRow + 1;
        (hot as any).alter("remove_row", bounds.startRow, amount);
        syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "row", bounds.startRow, amount) });
      },
      deleteSelectedColumns: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const amount = bounds.endCol - bounds.startCol + 1;
        (hot as any).alter("remove_col", bounds.startCol, amount);
        syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "col", bounds.startCol, amount) });
      },
      clearSelectedCells: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        for (const coord of getSelectedCells(hot, lastSelectionRef.current)) {
          hot.setDataAtCell(coord.row, coord.col, null, "toolbar-clear");
        }
        syncFromHot();
      },
      autoFitSelectedColumns: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const nextWidths = [...(latestSheetRef.current.colWidths || [])];
        for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
          let maxLength = columnLabel(col).length;
          for (const row of latestSheetRef.current.data) {
            maxLength = Math.max(maxLength, String(row[col] ?? "").length);
          }
          nextWidths[col] = clamp(maxLength * 9 + 36, 80, 320);
        }
        syncFromHot({ colWidths: nextWidths });
      },
      resetSelectedColumnWidths: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const nextWidths = [...(latestSheetRef.current.colWidths || [])];
        for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
          nextWidths[col] = 100;
        }
        syncFromHot({ colWidths: nextWidths });
      },
      setSelectedRowHeight: (height) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const normalizedHeight = normalizeRowHeight(height);
        const nextHeights = [...(latestSheetRef.current.rowHeights || [])];
        for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
          nextHeights[row] = normalizedHeight;
        }
        syncFromHot({ rowHeights: nextHeights });
        restoreStoredSelection(hot, lastSelectionRef.current);
        hot.render();
      },
      resetSelectedRowHeights: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const nextHeights = [...(latestSheetRef.current.rowHeights || [])];
        for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
          nextHeights[row] = DEFAULT_ROW_HEIGHT;
        }
        syncFromHot({ rowHeights: nextHeights });
      },
      sortSelectedColumn: (direction) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        restoreStoredSelection(hot, lastSelectionRef.current);
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const plugin = hot.getPlugin("columnSorting") as any;
        plugin?.sort?.({ column: bounds.startCol, sortOrder: direction });
        syncFromHot();
      },
    }));

    return (
      <div className="zn-spreadsheet-grid min-h-0 flex-1">
        <HotTable
          ref={hotRef}
          data={sheet.data}
          rowHeaders
          colHeaders
          language={lang === "zh" ? "zh-CN" : "en-US"}
          contextMenu
          dropdownMenu
          filters
          columnSorting={{ indicator: true, headerAction: false }}
          manualColumnResize
          manualRowResize
          manualColumnMove
          manualRowMove
          undo
          mergeCells={sheet.merges || []}
          fixedRowsTop={sheet.fixedRowsTop || 0}
          fixedColumnsLeft={sheet.fixedColumnsLeft || 0}
          colWidths={sheet.colWidths}
          rowHeights={sheet.rowHeights}
          formulas={{ engine: formulaEngine, sheetName: sheet.name }}
          cells={(row: number, col: number) => {
            const style = cellStyleByCoord.get(cellKey(row, col));
            return {
              className: buildCellClassName(style),
              renderer: (_instance: Handsontable, td: HTMLTableCellElement, _row: number, _col: number, _prop: string | number, value: SpreadsheetCellValue) => {
                td.style.color = resolveSpreadsheetColor(style?.textColor, "text") || "";
                td.style.backgroundColor = resolveSpreadsheetColor(style?.fillColor, "fill") || "";
                td.textContent = formatSpreadsheetCellDisplay(value, style?.numberFormat);
                return td;
              },
            };
          }}
          licenseKey="non-commercial-and-evaluation"
          stretchH="all"
          width="100%"
          height="100%"
          className="ht-theme-main"
          afterInit={() => {
            notifyActiveCellChange();
            notifySelectionSummaryChange();
          }}
          afterChange={(changes: unknown, source: string) => {
            if (source === "loadData" || source === "toolbar-clear" || !Array.isArray(changes)) return;
            const result = applySpreadsheetCellChanges(latestSheetRef.current, changes as SpreadsheetCellChange[]);
            if (!result.changed) return;
            emitSheetChange(result.sheet, { render: false });
            notifyActiveCellChange();
            notifySelectionSummaryChange();
          }}
          afterSetCellMeta={(row: number, column: number, key: string, value: unknown) => {
            if (row < 0 || column < 0 || key !== "className") return;
            const className = String(value || "");
            if (hasHandsontableAlignmentClass(className)) {
              contextMenuClassNameByCoordRef.current.set(cellKey(row, column), className);
            }
            scheduleCellMetaStyleSync();
          }}
          afterCreateRow={(index: number, amount: number, source?: string) => {
            if (!isContextMenuSource(source)) return;
            syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "row", index, amount) });
          }}
          afterRemoveRow={(index: number, amount: number, _physicalRows: number[], source?: string) => {
            if (!isContextMenuSource(source)) return;
            syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "row", index, amount) });
          }}
          afterCreateCol={(index: number, amount: number, source?: string) => {
            if (!isContextMenuSource(source)) return;
            syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "col", index, amount) });
          }}
          afterRemoveCol={(index: number, amount: number, _physicalColumns: number[], source?: string) => {
            if (!isContextMenuSource(source)) return;
            syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "col", index, amount) });
          }}
          beforeOnCellMouseDown={(event: MouseEvent) => {
            if (event.button === 2) startContextMenuInteraction();
          }}
          beforeOnCellContextMenu={(event: MouseEvent) => openContextMenuAfterPointerRelease(event)}
          beforeContextMenuShow={() => startContextMenuInteraction()}
          afterContextMenuShow={() => keepContextMenuInteraction()}
          afterContextMenuHide={() => {
            finishContextMenuInteraction();
          }}
          afterSelectionEnd={(row: number, column: number, row2: number, column2: number) => {
            const selection: SelectionTuple = [row, column, row2, column2];
            if (isUsableSelectionTuple(selection)) {
              lastSelectionRef.current = selection;
              if (contextMenuInteractionRef.current) return;
              notifyActiveCellChange();
              notifySelectionSummaryChange();
            }
          }}
          afterMergeCells={() => syncFromHot()}
          afterUnmergeCells={() => syncFromHot()}
          afterColumnResize={(newSize: number, column: number) => {
            syncFromHot({ colWidths: updateIndexedValue(latestSheetRef.current.colWidths, column, newSize) });
          }}
          afterRowResize={(newSize: number, row: number) => {
            syncFromHot({ rowHeights: updateIndexedValue(latestSheetRef.current.rowHeights, row, newSize) });
          }}
        />
      </div>
    );
  }
);

SpreadsheetGrid.displayName = "SpreadsheetGrid";
