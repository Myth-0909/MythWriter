import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { HotTable, type HotTableRef } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import HyperFormula from "hyperformula";
import type Handsontable from "handsontable";
import type {
  SpreadsheetCellColor,
  SpreadsheetCellStyle,
  SpreadsheetCellValue,
  SpreadsheetMergeCell,
  SpreadsheetSheet,
} from "@/types";
import { applySpreadsheetCellChanges, type SpreadsheetCellChange } from "@/lib/spreadsheetPerformance";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import "./spreadsheet.css";

let modulesRegistered = false;

function ensureHandsontableModules() {
  if (modulesRegistered) return;
  registerAllModules();
  modulesRegistered = true;
}

ensureHandsontableModules();

type CellStylePatch = Partial<Omit<SpreadsheetCellStyle, "row" | "col">>;
type ToggleCellStyleKey = "bold" | "italic" | "underline" | "wrap";

export interface SpreadsheetGridHandle {
  undo: () => void;
  redo: () => void;
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
  sortSelectedColumn: (direction: "asc" | "desc") => void;
}

export type SheetChangeOptions = {
  render?: boolean;
};

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  onSheetChange: (sheet: SpreadsheetSheet, options?: SheetChangeOptions) => void;
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

function updateIndexedValue(values: number[] | undefined, index: number, value: number) {
  const next = [...(values || [])];
  next[index] = value;
  return next;
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
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

function normalizeColor(value: SpreadsheetCellColor | undefined) {
  return value === "default" ? undefined : value;
}

function normalizeCellStyle(style: SpreadsheetCellStyle): SpreadsheetCellStyle | null {
  const next: SpreadsheetCellStyle = {
    row: style.row,
    col: style.col,
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(normalizeColor(style.textColor) ? { textColor: normalizeColor(style.textColor) } : {}),
    ...(normalizeColor(style.fillColor) ? { fillColor: normalizeColor(style.fillColor) } : {}),
    ...(style.horizontalAlign ? { horizontalAlign: style.horizontalAlign } : {}),
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

  const [rowA, colA, rowB, colB] = selected;
  const startRow = Math.max(0, Math.min(rowA, rowB));
  const endRow = Math.min(rowCount - 1, Math.max(rowA, rowB));
  const startCol = Math.max(0, Math.min(colA, colB));
  const endCol = Math.min(colCount - 1, Math.max(colA, colB));

  return { startRow, endRow, startCol, endCol };
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
    pushBounds({
      startRow: Math.max(0, Math.min(range.from.row, range.to.row)),
      endRow: Math.min(rowCount - 1, Math.max(range.from.row, range.to.row)),
      startCol: Math.max(0, Math.min(range.from.col, range.to.col)),
      endCol: Math.min(colCount - 1, Math.max(range.from.col, range.to.col)),
    });
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
    style.textColor && `zn-cell-text-${style.textColor}`,
    style.fillColor && `zn-cell-fill-${style.fillColor}`,
    style.horizontalAlign && `zn-cell-align-${style.horizontalAlign}`,
  ].filter(Boolean);
  return classes.length > 0 ? classes.join(" ") : undefined;
}

export const SpreadsheetGrid = forwardRef<SpreadsheetGridHandle, SpreadsheetGridProps>(
  ({ sheet, onSheetChange }, ref) => {
    const hotRef = useRef<HotTableRef>(null);
    const latestSheetRef = useRef(sheet);
    const lastSelectionRef = useRef<SelectionTuple | null>(null);
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

    useImperativeHandle(ref, () => ({
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
        const range = hot?.getSelectedRangeLast();
        if (!hot || !range) return;
        const plugin = hot.getPlugin("mergeCells") as any;
        plugin?.mergeRange?.(range);
        hot.render();
        syncFromHot();
      },
      unmergeSelected: () => {
        const hot = hotRef.current?.hotInstance;
        const range = hot?.getSelectedRangeLast();
        if (!hot || !range) return;
        const plugin = hot.getPlugin("mergeCells") as any;
        plugin?.unmergeSelection?.(range);
        hot.render();
        syncFromHot();
      },
      applyCellStyle: (patch, options) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
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
        hot.render();
      },
      insertRowAbove: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds?.startRow ?? 0;
        (hot as any).alter("insert_row_above", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "row", index) });
      },
      insertRowBelow: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds ? bounds.endRow + 1 : hot.countRows();
        (hot as any).alter("insert_row_above", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "row", index) });
      },
      insertColumnLeft: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds?.startCol ?? 0;
        (hot as any).alter("insert_col_start", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "col", index) });
      },
      insertColumnRight: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        const index = bounds ? bounds.endCol + 1 : hot.countCols();
        (hot as any).alter("insert_col_start", index, 1);
        syncFromHot({ cellStyles: shiftStylesForInsert(latestSheetRef.current.cellStyles, "col", index) });
      },
      deleteSelectedRows: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const amount = bounds.endRow - bounds.startRow + 1;
        (hot as any).alter("remove_row", bounds.startRow, amount);
        syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "row", bounds.startRow, amount) });
      },
      deleteSelectedColumns: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        const bounds = getSelectedBounds(hot, lastSelectionRef.current);
        if (!bounds) return;
        const amount = bounds.endCol - bounds.startCol + 1;
        (hot as any).alter("remove_col", bounds.startCol, amount);
        syncFromHot({ cellStyles: shiftStylesForDelete(latestSheetRef.current.cellStyles, "col", bounds.startCol, amount) });
      },
      clearSelectedCells: () => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
        for (const coord of getSelectedCells(hot, lastSelectionRef.current)) {
          hot.setDataAtCell(coord.row, coord.col, null, "toolbar-clear");
        }
        syncFromHot();
      },
      sortSelectedColumn: (direction) => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) return;
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
          contextMenu
          dropdownMenu
          filters
          columnSorting
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
          cells={(row: number, col: number) => ({
            className: buildCellClassName(cellStyleByCoord.get(cellKey(row, col))),
          })}
          licenseKey="non-commercial-and-evaluation"
          stretchH="all"
          width="100%"
          height="100%"
          className="ht-theme-main"
          afterChange={(changes: unknown, source: string) => {
            if (source === "loadData" || source === "toolbar-clear" || !Array.isArray(changes)) return;
            const result = applySpreadsheetCellChanges(latestSheetRef.current, changes as SpreadsheetCellChange[]);
            if (!result.changed) return;
            emitSheetChange(result.sheet, { render: false });
          }}
          afterSelectionEnd={(row: number, column: number, row2: number, column2: number) => {
            if ([row, column, row2, column2].every((value) => Number.isInteger(value) && value >= 0)) {
              lastSelectionRef.current = [row, column, row2, column2];
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
