import type { SpreadsheetCellValue, SpreadsheetSheet } from "@/types";

export interface SpreadsheetFindMatch {
  row: number;
  col: number;
  cellLabel: string;
  value: string;
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

function cellText(value: SpreadsheetCellValue | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findSpreadsheetMatches(sheet: SpreadsheetSheet, query: string): SpreadsheetFindMatch[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const matches: SpreadsheetFindMatch[] = [];
  sheet.data.forEach((rowValues, row) => {
    rowValues.forEach((value, col) => {
      const text = cellText(value);
      if (!text.toLocaleLowerCase().includes(needle)) return;
      matches.push({ row, col, cellLabel: cellLabel(row, col), value: text });
    });
  });
  return matches;
}

export function replaceSpreadsheetMatch(
  sheet: SpreadsheetSheet,
  match: Pick<SpreadsheetFindMatch, "row" | "col">,
  replacement: string
): SpreadsheetSheet {
  const next = cloneSheet(sheet);
  while (next.data.length <= match.row) next.data.push([]);
  while (next.data[match.row].length <= match.col) next.data[match.row].push(null);
  next.data[match.row][match.col] = replacement;
  return next;
}

export function replaceAllSpreadsheetMatches(
  sheet: SpreadsheetSheet,
  query: string,
  replacement: string
): { sheet: SpreadsheetSheet; count: number } {
  const trimmed = query.trim();
  if (!trimmed) return { sheet, count: 0 };

  const next = cloneSheet(sheet);
  const pattern = new RegExp(escapeRegExp(trimmed), "gi");
  let count = 0;

  next.data = next.data.map((row) =>
    row.map((value) => {
      const text = cellText(value);
      if (!text || !pattern.test(text)) return value;
      pattern.lastIndex = 0;
      count += 1;
      return text.replace(pattern, replacement);
    })
  );

  return { sheet: next, count };
}
