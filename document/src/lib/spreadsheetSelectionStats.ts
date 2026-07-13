import type { SpreadsheetCellValue, SpreadsheetSheet } from "@/types";

export interface SpreadsheetSelectionBounds {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface SpreadsheetSelectionSummary {
  rangeLabel: string;
  cellCount: number;
  numberCount: number;
  sum: number | null;
  average: number | null;
  min: number | null;
  max: number | null;
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

function cellLabel(row: number, col: number) {
  return `${columnLabel(col)}${row + 1}`;
}

function rangeLabel(bounds: SpreadsheetSelectionBounds) {
  const start = cellLabel(bounds.startRow, bounds.startCol);
  const end = cellLabel(bounds.endRow, bounds.endCol);
  return start === end ? start : `${start}:${end}`;
}

function numericValue(value: SpreadsheetCellValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildSpreadsheetSelectionSummary(
  sheet: SpreadsheetSheet,
  bounds: SpreadsheetSelectionBounds
): SpreadsheetSelectionSummary {
  let cellCount = 0;
  let numberCount = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    for (let col = bounds.startCol; col <= bounds.endCol; col += 1) {
      cellCount += 1;
      const value = numericValue(sheet.data[row]?.[col]);
      if (value !== null) {
        numberCount += 1;
        sum += value;
        min = min === null ? value : Math.min(min, value);
        max = max === null ? value : Math.max(max, value);
      }
    }
  }

  if (numberCount === 0) {
    return {
      rangeLabel: rangeLabel(bounds),
      cellCount,
      numberCount: 0,
      sum: null,
      average: null,
      min: null,
      max: null,
    };
  }

  return {
    rangeLabel: rangeLabel(bounds),
    cellCount,
    numberCount,
    sum,
    average: sum / numberCount,
    min,
    max,
  };
}
