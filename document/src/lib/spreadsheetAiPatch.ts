import type { SpreadsheetCellValue, SpreadsheetSheet, SpreadsheetWorkbook } from "../types";

export type SpreadsheetPatchOperation =
  | { type: "set_cell"; sheetId?: string; sheetName?: string; row: number; col: number; value: SpreadsheetCellValue }
  | { type: "set_range"; sheetId?: string; sheetName?: string; startRow: number; startCol: number; values: SpreadsheetCellValue[][] }
  | { type: "append_row"; sheetId?: string; sheetName?: string; values: SpreadsheetCellValue[] }
  | { type: "rename_sheet"; sheetId?: string; sheetName?: string; name: string };

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

function ensureCell(data: SpreadsheetCellValue[][], row: number, col: number) {
  while (data.length <= row) data.push([]);
  while (data[row].length <= col) data[row].push(null);
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
  return `${sheet.name} -> ${operation.name}`;
}

export function applySpreadsheetPatch(workbook: SpreadsheetWorkbook, patch: SpreadsheetPatchAction): SpreadsheetPatchResult {
  const nextWorkbook = cloneWorkbook(workbook);
  const operations = Array.isArray(patch.operations) ? patch.operations : [];
  const summary: string[] = [];
  let appliedCount = 0;

  for (const operation of operations) {
    if (!operation || typeof operation !== "object") continue;
    const sheet = resolveSheet(nextWorkbook, operation);
    if (!sheet) continue;

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
