import type { SpreadsheetCellValue, SpreadsheetSheet } from "../types";

export type SpreadsheetCellChange = [number, number | string, unknown, unknown];

export function applySpreadsheetCellChanges(sheet: SpreadsheetSheet, _changes: SpreadsheetCellChange[]) {
  const changes = Array.isArray(_changes) ? _changes : [];
  let nextData: SpreadsheetCellValue[][] | null = null;
  const clonedRows = new Map<number, SpreadsheetCellValue[]>();

  const ensureRow = (rowIndex: number) => {
    if (!nextData) nextData = [...sheet.data];
    while (nextData.length <= rowIndex) nextData.push([]);
    const existing = clonedRows.get(rowIndex);
    if (existing) return existing;
    const row = [...(nextData[rowIndex] || [])];
    nextData[rowIndex] = row;
    clonedRows.set(rowIndex, row);
    return row;
  };

  for (const [rowValue, prop, oldValue, newValue] of changes) {
    const row = Number(rowValue);
    const col = Number(prop);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) continue;
    if (Object.is(oldValue, newValue)) continue;
    const nextRow = ensureRow(row);
    while (nextRow.length <= col) nextRow.push(null);
    nextRow[col] = normalizeCellValue(newValue);
  }

  if (!nextData) {
    return {
      sheet,
      changed: false,
    };
  }

  return {
    sheet: {
      ...sheet,
      data: nextData,
    },
    changed: true,
  };
}

function normalizeCellValue(value: unknown): SpreadsheetCellValue {
  if (value === null || value === undefined) return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value as SpreadsheetCellValue;
  return String(value);
}
