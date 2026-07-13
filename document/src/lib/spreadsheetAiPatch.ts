import { createSpreadsheetSheet } from "./spreadsheetWorkbook.ts";
import type { SpreadsheetCellStyle, SpreadsheetCellValue, SpreadsheetMergeCell, SpreadsheetSheet, SpreadsheetWorkbook } from "../types";

export type SpreadsheetPatchOperation =
  | { type: "set_cell"; sheetId?: string; sheetName?: string; row: number; col: number; value: SpreadsheetCellValue }
  | { type: "set_range"; sheetId?: string; sheetName?: string; startRow: number; startCol: number; values: SpreadsheetCellValue[][] }
  | { type: "append_row"; sheetId?: string; sheetName?: string; values: SpreadsheetCellValue[] }
  | { type: "set_style"; sheetId?: string; sheetName?: string; startRow: number; startCol: number; endRow: number; endCol: number; style: Partial<Omit<SpreadsheetCellStyle, "row" | "col">> }
  | { type: "merge_cells"; sheetId?: string; sheetName?: string; row: number; col: number; rowspan: number; colspan: number }
  | { type: "unmerge_cells"; sheetId?: string; sheetName?: string; row: number; col: number }
  | { type: "freeze_panes"; sheetId?: string; sheetName?: string; fixedRowsTop?: number; fixedColumnsLeft?: number }
  | { type: "sort_range"; sheetId?: string; sheetName?: string; startRow: number; endRow: number; sortCol: number; direction?: "asc" | "desc" }
  | { type: "rename_sheet"; sheetId?: string; sheetName?: string; name: string }
  | { type: "create_sheet"; name?: string; data?: SpreadsheetCellValue[][] }
  | { type: "delete_sheet"; sheetId?: string; sheetName?: string }
  | { type: "insert_rows"; sheetId?: string; sheetName?: string; index: number; count?: number; values?: SpreadsheetCellValue[][] }
  | { type: "delete_rows"; sheetId?: string; sheetName?: string; index: number; count?: number }
  | { type: "insert_columns"; sheetId?: string; sheetName?: string; index: number; count?: number; values?: SpreadsheetCellValue[][] }
  | { type: "delete_columns"; sheetId?: string; sheetName?: string; index: number; count?: number }
  | { type: "clear_range"; sheetId?: string; sheetName?: string; startRow: number; startCol: number; endRow: number; endCol: number };

export type SpreadsheetPatchAction = {
  type?: "spreadsheet_patch";
  spreadsheetId?: string;
  operations?: SpreadsheetPatchOperation[];
};

export type SpreadsheetPatchResult = {
  workbook: SpreadsheetWorkbook;
  appliedCount: number;
  summary: string;
};

function cloneSheet(sheet: SpreadsheetSheet): SpreadsheetSheet {
  return {
    ...sheet,
    data: sheet.data.map((row) => [...row]),
    cellStyles: sheet.cellStyles?.map((style) => ({ ...style })) || [],
    merges: sheet.merges?.map((merge) => ({ ...merge })) || [],
    rowHeights: sheet.rowHeights ? [...sheet.rowHeights] : [],
    colWidths: sheet.colWidths ? [...sheet.colWidths] : [],
  };
}

function cloneWorkbook(workbook: SpreadsheetWorkbook): SpreadsheetWorkbook {
  return {
    ...workbook,
    sheets: workbook.sheets.map(cloneSheet),
  };
}

function resolveSheet(workbook: SpreadsheetWorkbook, operation: SpreadsheetPatchOperation): SpreadsheetSheet | null {
  if ("sheetId" in operation && operation.sheetId) {
    const byId = workbook.sheets.find((sheet) => sheet.id === operation.sheetId);
    if (byId) return byId;
  }
  if ("sheetName" in operation && operation.sheetName) {
    const byName = workbook.sheets.find((sheet) => sheet.name === operation.sheetName);
    if (byName) return byName;
  }
  return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) || workbook.sheets[0] || null;
}

function normalizeIndex(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) return null;
  return numeric;
}

function normalizeCellValue(value: unknown): SpreadsheetCellValue {
  if (value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value as SpreadsheetCellValue;
  return String(value);
}

function normalizeCount(value: unknown, fallback = 1): number {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return Math.min(200, numeric);
}

function ensureCell(data: SpreadsheetCellValue[][], row: number, col: number) {
  while (data.length <= row) data.push([]);
  while (data[row].length <= col) data[row].push(null);
}

function normalizeRows(value: unknown): SpreadsheetCellValue[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map(normalizeCellValue));
}

function findAppendRowIndex(sheet: SpreadsheetSheet): number {
  let lastUsed = -1;
  sheet.data.forEach((row, index) => {
    if (row.some((cell) => cell !== null && cell !== "" && cell !== undefined)) lastUsed = index;
  });
  return lastUsed + 1;
}

function operationLabel(operation: SpreadsheetPatchOperation, sheet: SpreadsheetSheet): string {
  if (operation.type === "set_cell") return `${sheet.name}!R${operation.row + 1}C${operation.col + 1}`;
  if (operation.type === "set_range") return `${sheet.name}!R${operation.startRow + 1}C${operation.startCol + 1}`;
  if (operation.type === "append_row") return `${sheet.name} append row`;
  if (operation.type === "set_style") return `${sheet.name}!R${operation.startRow + 1}C${operation.startCol + 1}`;
  if (operation.type === "merge_cells" || operation.type === "unmerge_cells") return `${sheet.name}!R${operation.row + 1}C${operation.col + 1}`;
  if (operation.type === "freeze_panes") return `${sheet.name} freeze panes`;
  if (operation.type === "sort_range") return `${sheet.name} sort column ${operation.sortCol + 1}`;
  if (operation.type === "rename_sheet") return `${sheet.name} -> ${operation.name}`;
  if (operation.type === "create_sheet") return operation.name || sheet.name;
  if (operation.type === "delete_sheet") return sheet.name;
  if (operation.type === "insert_rows" || operation.type === "delete_rows") return `${sheet.name} row ${operation.index + 1}`;
  if (operation.type === "insert_columns" || operation.type === "delete_columns") return `${sheet.name} column ${operation.index + 1}`;
  return `${sheet.name}!R${operation.startRow + 1}C${operation.startCol + 1}`;
}

function shiftStylesForInsert(
  styles: SpreadsheetCellStyle[] | undefined,
  axis: "row" | "col",
  index: number,
  amount: number
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

function shiftMergesForInsert(
  merges: SpreadsheetMergeCell[] | undefined,
  axis: "row" | "col",
  index: number,
  amount: number
) {
  return (merges || []).map((merge) => ({
    ...merge,
    [axis]: merge[axis] >= index ? merge[axis] + amount : merge[axis],
  }));
}

function shiftMergesForDelete(
  merges: SpreadsheetMergeCell[] | undefined,
  axis: "row" | "col",
  index: number,
  amount: number
) {
  const spanKey = axis === "row" ? "rowspan" : "colspan";
  return (merges || [])
    .filter((merge) => {
      const start = merge[axis];
      const end = start + merge[spanKey] - 1;
      return end < index || start >= index + amount;
    })
    .map((merge) => ({
      ...merge,
      [axis]: merge[axis] >= index + amount ? merge[axis] - amount : merge[axis],
    }));
}

function insertRows(sheet: SpreadsheetSheet, index: number, count: number, values: SpreadsheetCellValue[][]) {
  const rows = Array.from({ length: count }, (_, rowIndex) => values[rowIndex] ? [...values[rowIndex]] : []);
  const targetIndex = Math.min(index, sheet.data.length);
  sheet.data.splice(targetIndex, 0, ...rows);
  if (sheet.rowHeights) sheet.rowHeights.splice(targetIndex, 0, ...Array.from({ length: count }, () => 24));
  sheet.cellStyles = shiftStylesForInsert(sheet.cellStyles, "row", targetIndex, count);
  sheet.merges = shiftMergesForInsert(sheet.merges, "row", targetIndex, count);
}

function deleteRows(sheet: SpreadsheetSheet, index: number, count: number): boolean {
  if (sheet.data.length === 0 || index >= sheet.data.length) return false;
  const targetIndex = Math.min(index, sheet.data.length - 1);
  const amount = Math.min(count, sheet.data.length - targetIndex);
  if (amount <= 0) return false;
  sheet.data.splice(targetIndex, amount);
  sheet.rowHeights?.splice(targetIndex, amount);
  sheet.cellStyles = shiftStylesForDelete(sheet.cellStyles, "row", targetIndex, amount);
  sheet.merges = shiftMergesForDelete(sheet.merges, "row", targetIndex, amount);
  return true;
}

function insertColumns(sheet: SpreadsheetSheet, index: number, count: number, values: SpreadsheetCellValue[][]) {
  const maxCols = Math.max(0, ...sheet.data.map((row) => row.length));
  const targetIndex = Math.min(index, maxCols);
  const rowsNeeded = Math.max(sheet.data.length, values.length);
  while (sheet.data.length < rowsNeeded) sheet.data.push([]);
  for (let rowIndex = 0; rowIndex < sheet.data.length; rowIndex += 1) {
    const rowValues = values[rowIndex] || [];
    const inserted = Array.from({ length: count }, (_, colOffset) => normalizeCellValue(rowValues[colOffset]));
    sheet.data[rowIndex].splice(targetIndex, 0, ...inserted);
  }
  if (sheet.colWidths) sheet.colWidths.splice(targetIndex, 0, ...Array.from({ length: count }, () => 100));
  sheet.cellStyles = shiftStylesForInsert(sheet.cellStyles, "col", targetIndex, count);
  sheet.merges = shiftMergesForInsert(sheet.merges, "col", targetIndex, count);
}

function deleteColumns(sheet: SpreadsheetSheet, index: number, count: number): boolean {
  const maxCols = Math.max(0, ...sheet.data.map((row) => row.length));
  if (maxCols === 0 || index >= maxCols) return false;
  const targetIndex = Math.min(index, maxCols - 1);
  const amount = Math.min(count, maxCols - targetIndex);
  if (amount <= 0) return false;
  for (const row of sheet.data) {
    row.splice(targetIndex, amount);
  }
  sheet.colWidths?.splice(targetIndex, amount);
  sheet.cellStyles = shiftStylesForDelete(sheet.cellStyles, "col", targetIndex, amount);
  sheet.merges = shiftMergesForDelete(sheet.merges, "col", targetIndex, amount);
  return true;
}

function normalizeStylePatch(value: unknown): Partial<Omit<SpreadsheetCellStyle, "row" | "col">> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Omit<SpreadsheetCellStyle, "row" | "col">>;
  const patch: Partial<Omit<SpreadsheetCellStyle, "row" | "col">> = {};
  if (typeof source.bold === "boolean") patch.bold = source.bold;
  if (typeof source.italic === "boolean") patch.italic = source.italic;
  if (typeof source.underline === "boolean") patch.underline = source.underline;
  if (typeof source.wrap === "boolean") patch.wrap = source.wrap;
  if (typeof source.border === "boolean") patch.border = source.border;
  if (["default", "red", "green", "blue", "amber", "gray"].includes(String(source.textColor))) patch.textColor = source.textColor;
  if (["default", "red", "green", "blue", "amber", "gray"].includes(String(source.fillColor))) patch.fillColor = source.fillColor;
  if (["left", "center", "right", "justify"].includes(String(source.horizontalAlign))) patch.horizontalAlign = source.horizontalAlign;
  if (["top", "middle", "bottom"].includes(String(source.verticalAlign))) patch.verticalAlign = source.verticalAlign;
  if (["general", "number", "currency", "percent", "date"].includes(String(source.numberFormat))) patch.numberFormat = source.numberFormat;
  if (["small", "normal", "large"].includes(String(source.fontSize))) patch.fontSize = source.fontSize;
  return Object.keys(patch).length > 0 ? patch : null;
}

function applyStyleRange(
  sheet: SpreadsheetSheet,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  patch: Partial<Omit<SpreadsheetCellStyle, "row" | "col">>
) {
  const styles = new Map<string, SpreadsheetCellStyle>();
  for (const style of sheet.cellStyles || []) {
    styles.set(`${style.row}:${style.col}`, { ...style });
  }

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      ensureCell(sheet.data, row, col);
      const key = `${row}:${col}`;
      styles.set(key, { ...(styles.get(key) || { row, col }), ...patch });
    }
  }

  sheet.cellStyles = Array.from(styles.values());
}

function mergeCells(sheet: SpreadsheetSheet, row: number, col: number, rowspan: number, colspan: number) {
  sheet.merges = (sheet.merges || []).filter((merge) => merge.row !== row || merge.col !== col);
  sheet.merges.push({ row, col, rowspan, colspan });
}

function unmergeCell(sheet: SpreadsheetSheet, row: number, col: number): boolean {
  const before = sheet.merges?.length || 0;
  sheet.merges = (sheet.merges || []).filter((merge) => {
    const rowEnd = merge.row + merge.rowspan - 1;
    const colEnd = merge.col + merge.colspan - 1;
    return row < merge.row || row > rowEnd || col < merge.col || col > colEnd;
  });
  return before !== sheet.merges.length;
}

function compareCellValues(left: SpreadsheetCellValue, right: SpreadsheetCellValue, direction: "asc" | "desc") {
  const leftNumber = typeof left === "number" ? left : Number(left);
  const rightNumber = typeof right === "number" ? right : Number(right);
  const numeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
    ? leftNumber - rightNumber
    : String(left ?? "").localeCompare(String(right ?? ""), "zh-CN", { numeric: true });
  return direction === "desc" ? -numeric : numeric;
}

function sortRange(sheet: SpreadsheetSheet, startRow: number, endRow: number, sortCol: number, direction: "asc" | "desc") {
  if (sheet.data.length === 0 || startRow >= sheet.data.length) return false;
  const rowStart = Math.min(startRow, endRow);
  const rowEnd = Math.min(sheet.data.length - 1, Math.max(startRow, endRow));
  const rows = sheet.data.slice(rowStart, rowEnd + 1);
  rows.sort((left, right) => compareCellValues(left[sortCol] ?? null, right[sortCol] ?? null, direction));
  sheet.data.splice(rowStart, rows.length, ...rows);
  return true;
}

export function applySpreadsheetPatch(workbook: SpreadsheetWorkbook, patch: SpreadsheetPatchAction): SpreadsheetPatchResult {
  const nextWorkbook = cloneWorkbook(workbook);
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  const summary: string[] = [];
  let appliedCount = 0;

  for (const operation of operations) {
    if (!operation || typeof operation !== "object") continue;

    if (operation.type === "create_sheet") {
      const name = String(operation.name || "").trim();
      const sheet = createSpreadsheetSheet(name || undefined) as SpreadsheetSheet;
      const rows = normalizeRows(operation.data);
      if (rows.length > 0) sheet.data = rows;
      nextWorkbook.sheets.push(sheet);
      nextWorkbook.activeSheetId = sheet.id;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    const sheet = resolveSheet(nextWorkbook, operation);
    if (!sheet) continue;

    if (operation.type === "delete_sheet") {
      if (nextWorkbook.sheets.length <= 1) continue;
      nextWorkbook.sheets = nextWorkbook.sheets.filter((item) => item.id !== sheet.id);
      if (nextWorkbook.activeSheetId === sheet.id) {
        nextWorkbook.activeSheetId = nextWorkbook.sheets[0].id;
      }
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "set_cell") {
      const row = normalizeIndex(operation.row);
      const col = normalizeIndex(operation.col);
      if (row === null || col === null) continue;
      ensureCell(sheet.data, row, col);
      sheet.data[row][col] = normalizeCellValue(operation.value);
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "set_range") {
      const startRow = normalizeIndex(operation.startRow);
      const startCol = normalizeIndex(operation.startCol);
      if (startRow === null || startCol === null || !Array.isArray(operation.values)) continue;
      operation.values.forEach((rowValues, rowOffset) => {
        if (!Array.isArray(rowValues)) return;
        rowValues.forEach((value, colOffset) => {
          const row = startRow + rowOffset;
          const col = startCol + colOffset;
          ensureCell(sheet.data, row, col);
          sheet.data[row][col] = normalizeCellValue(value);
        });
      });
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "append_row") {
      if (!Array.isArray(operation.values)) continue;
      const row = findAppendRowIndex(sheet);
      const values = operation.values.map(normalizeCellValue);
      ensureCell(sheet.data, row, Math.max(0, values.length - 1));
      sheet.data[row] = values;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "set_style") {
      const startRow = normalizeIndex(operation.startRow);
      const startCol = normalizeIndex(operation.startCol);
      const endRow = normalizeIndex(operation.endRow);
      const endCol = normalizeIndex(operation.endCol);
      const style = normalizeStylePatch(operation.style);
      if (startRow === null || startCol === null || endRow === null || endCol === null || !style) continue;
      applyStyleRange(
        sheet,
        Math.min(startRow, endRow),
        Math.min(startCol, endCol),
        Math.max(startRow, endRow),
        Math.max(startCol, endCol),
        style
      );
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "merge_cells") {
      const row = normalizeIndex(operation.row);
      const col = normalizeIndex(operation.col);
      const rowspan = normalizeCount(operation.rowspan);
      const colspan = normalizeCount(operation.colspan);
      if (row === null || col === null) continue;
      mergeCells(sheet, row, col, rowspan, colspan);
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "unmerge_cells") {
      const row = normalizeIndex(operation.row);
      const col = normalizeIndex(operation.col);
      if (row === null || col === null) continue;
      if (!unmergeCell(sheet, row, col)) continue;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "freeze_panes") {
      sheet.fixedRowsTop = normalizeIndex(operation.fixedRowsTop) ?? 0;
      sheet.fixedColumnsLeft = normalizeIndex(operation.fixedColumnsLeft) ?? 0;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "sort_range") {
      const startRow = normalizeIndex(operation.startRow);
      const endRow = normalizeIndex(operation.endRow);
      const sortCol = normalizeIndex(operation.sortCol);
      if (startRow === null || endRow === null || sortCol === null) continue;
      if (!sortRange(sheet, startRow, endRow, sortCol, operation.direction === "desc" ? "desc" : "asc")) continue;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "insert_rows") {
      const index = normalizeIndex(operation.index);
      if (index === null) continue;
      const rows = normalizeRows(operation.values);
      const count = normalizeCount(operation.count, rows.length || 1);
      insertRows(sheet, index, count, rows);
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "delete_rows") {
      const index = normalizeIndex(operation.index);
      if (index === null) continue;
      if (!deleteRows(sheet, index, normalizeCount(operation.count))) continue;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "insert_columns") {
      const index = normalizeIndex(operation.index);
      if (index === null) continue;
      const rows = normalizeRows(operation.values);
      const count = normalizeCount(operation.count, Math.max(1, ...rows.map((row) => row.length)));
      insertColumns(sheet, index, count, rows);
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "delete_columns") {
      const index = normalizeIndex(operation.index);
      if (index === null) continue;
      if (!deleteColumns(sheet, index, normalizeCount(operation.count))) continue;
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "clear_range") {
      const startRow = normalizeIndex(operation.startRow);
      const startCol = normalizeIndex(operation.startCol);
      const endRow = normalizeIndex(operation.endRow);
      const endCol = normalizeIndex(operation.endCol);
      if (startRow === null || startCol === null || endRow === null || endCol === null) continue;
      const rowStart = Math.min(startRow, endRow);
      const rowEnd = Math.max(startRow, endRow);
      const colStart = Math.min(startCol, endCol);
      const colEnd = Math.max(startCol, endCol);
      for (let row = rowStart; row <= rowEnd; row += 1) {
        for (let col = colStart; col <= colEnd; col += 1) {
          ensureCell(sheet.data, row, col);
          sheet.data[row][col] = null;
        }
      }
      appliedCount += 1;
      summary.push(operationLabel(operation, sheet));
      continue;
    }

    if (operation.type === "rename_sheet") {
      const name = String(operation.name || "").trim();
      if (!name) continue;
      summary.push(operationLabel(operation, sheet));
      sheet.name = name;
      appliedCount += 1;
    }
  }

  return {
    workbook: nextWorkbook,
    appliedCount,
    summary: summary.join("\n"),
  };
}
