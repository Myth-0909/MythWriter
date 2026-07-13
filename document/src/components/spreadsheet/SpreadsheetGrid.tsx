import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { HotTable, type HotTableRef } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import HyperFormula from "hyperformula";
import type Handsontable from "handsontable";
import type { SpreadsheetCellValue, SpreadsheetMergeCell, SpreadsheetSheet } from "@/types";
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

export interface SpreadsheetGridHandle {
  undo: () => void;
  redo: () => void;
  mergeSelected: () => void;
  unmergeSelected: () => void;
}

interface SpreadsheetGridProps {
  sheet: SpreadsheetSheet;
  onSheetChange: (sheet: SpreadsheetSheet) => void;
}

function updateIndexedValue(values: number[] | undefined, index: number, value: number) {
  const next = [...(values || [])];
  next[index] = value;
  return next;
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

export const SpreadsheetGrid = forwardRef<SpreadsheetGridHandle, SpreadsheetGridProps>(
  ({ sheet, onSheetChange }, ref) => {
    const hotRef = useRef<HotTableRef>(null);
    const formulaEngine = useMemo(
      () => HyperFormula.buildEmpty({ licenseKey: "internal-use-in-handsontable" }),
      []
    );

    const syncFromHot = (overrides: Partial<SpreadsheetSheet> = {}) => {
      const hot = hotRef.current?.hotInstance;
      if (!hot) return;
      onSheetChange({
        ...sheet,
        data: readData(hot),
        merges: readMerges(hot),
        ...overrides,
      });
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
          licenseKey="non-commercial-and-evaluation"
          stretchH="all"
          width="100%"
          height="100%"
          className="ht-theme-main"
          afterChange={(_changes: unknown, source: string) => {
            if (source === "loadData") return;
            syncFromHot();
          }}
          afterMergeCells={() => syncFromHot()}
          afterUnmergeCells={() => syncFromHot()}
          afterColumnResize={(newSize: number, column: number) => {
            syncFromHot({ colWidths: updateIndexedValue(sheet.colWidths, column, newSize) });
          }}
          afterRowResize={(newSize: number, row: number) => {
            syncFromHot({ rowHeights: updateIndexedValue(sheet.rowHeights, row, newSize) });
          }}
        />
      </div>
    );
  }
);

SpreadsheetGrid.displayName = "SpreadsheetGrid";
