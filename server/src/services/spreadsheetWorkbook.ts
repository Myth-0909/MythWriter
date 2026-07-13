import { randomUUID } from "node:crypto";

export type SpreadsheetCellValue = string | number | boolean | null;

export interface SpreadsheetMergeCell {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export type SpreadsheetCellColor = "default" | "red" | "green" | "blue" | "amber" | "gray";
export type SpreadsheetHorizontalAlign = "left" | "center" | "right";

export interface SpreadsheetCellStyle {
  row: number;
  col: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  textColor?: SpreadsheetCellColor;
  fillColor?: SpreadsheetCellColor;
  horizontalAlign?: SpreadsheetHorizontalAlign;
  wrap?: boolean;
}

export interface SpreadsheetSheet {
  id: string;
  name: string;
  data: SpreadsheetCellValue[][];
  cellStyles?: SpreadsheetCellStyle[];
  merges?: SpreadsheetMergeCell[];
  fixedRowsTop?: number;
  fixedColumnsLeft?: number;
  rowHeights?: number[];
  colWidths?: number[];
}

export interface SpreadsheetWorkbook {
  version: 1;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
}

const DEFAULT_ROWS = 40;
const DEFAULT_COLUMNS = 12;
const PREVIEW_LIMIT = 12;

function createId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function createEmptyGrid(rows = DEFAULT_ROWS, columns = DEFAULT_COLUMNS): SpreadsheetCellValue[][] {
  return Array.from({ length: rows }, () => Array.from({ length: columns }, () => null));
}

function normalizeName(name: string | undefined, fallback: string) {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

export function createDefaultSpreadsheetSheet(name?: string): SpreadsheetSheet {
  return {
    id: createId("sheet"),
    name: normalizeName(name, "Sheet 1"),
    data: createEmptyGrid(),
    cellStyles: [],
    merges: [],
    fixedRowsTop: 0,
    fixedColumnsLeft: 0,
    rowHeights: [],
    colWidths: [],
  };
}

export function createDefaultSpreadsheetWorkbook(): SpreadsheetWorkbook {
  const sheet = createDefaultSpreadsheetSheet();
  return {
    version: 1,
    activeSheetId: sheet.id,
    sheets: [sheet],
  };
}

function isCellValue(value: unknown): value is SpreadsheetCellValue {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function isGrid(value: unknown): value is SpreadsheetCellValue[][] {
  return Array.isArray(value) && value.every((row) => Array.isArray(row) && row.every(isCellValue));
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => Number.isFinite(item));
}

function isMergeCell(value: unknown): value is SpreadsheetMergeCell {
  if (!value || typeof value !== "object") return false;
  const merge = value as Record<string, unknown>;
  return (
    Number.isInteger(merge.row) &&
    Number.isInteger(merge.col) &&
    Number.isInteger(merge.rowspan) &&
    Number.isInteger(merge.colspan) &&
    Number(merge.rowspan) > 0 &&
    Number(merge.colspan) > 0
  );
}

function isCellColor(value: unknown): value is SpreadsheetCellColor {
  return value === undefined || ["default", "red", "green", "blue", "amber", "gray"].includes(String(value));
}

function isHorizontalAlign(value: unknown): value is SpreadsheetHorizontalAlign {
  return value === undefined || ["left", "center", "right"].includes(String(value));
}

function isCellStyle(value: unknown): value is SpreadsheetCellStyle {
  if (!value || typeof value !== "object") return false;
  const style = value as Record<string, unknown>;
  return (
    Number.isInteger(style.row) &&
    Number.isInteger(style.col) &&
    (style.bold === undefined || typeof style.bold === "boolean") &&
    (style.italic === undefined || typeof style.italic === "boolean") &&
    (style.underline === undefined || typeof style.underline === "boolean") &&
    isCellColor(style.textColor) &&
    isCellColor(style.fillColor) &&
    isHorizontalAlign(style.horizontalAlign) &&
    (style.wrap === undefined || typeof style.wrap === "boolean")
  );
}

function isSheet(value: unknown): value is SpreadsheetSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as Record<string, unknown>;
  return (
    typeof sheet.id === "string" &&
    sheet.id.length > 0 &&
    typeof sheet.name === "string" &&
    sheet.name.trim().length > 0 &&
    isGrid(sheet.data) &&
    (sheet.cellStyles === undefined || (Array.isArray(sheet.cellStyles) && sheet.cellStyles.every(isCellStyle))) &&
    (sheet.merges === undefined || (Array.isArray(sheet.merges) && sheet.merges.every(isMergeCell))) &&
    (sheet.fixedRowsTop === undefined || Number.isInteger(sheet.fixedRowsTop)) &&
    (sheet.fixedColumnsLeft === undefined || Number.isInteger(sheet.fixedColumnsLeft)) &&
    (sheet.rowHeights === undefined || isNumberArray(sheet.rowHeights)) &&
    (sheet.colWidths === undefined || isNumberArray(sheet.colWidths))
  );
}

export function validateSpreadsheetWorkbook(value: unknown): value is SpreadsheetWorkbook {
  if (!value || typeof value !== "object") return false;
  const workbook = value as Record<string, unknown>;
  if (workbook.version !== 1) return false;
  if (typeof workbook.activeSheetId !== "string") return false;
  if (!Array.isArray(workbook.sheets) || workbook.sheets.length === 0) return false;
  if (!workbook.sheets.every(isSheet)) return false;
  return workbook.sheets.some((sheet) => sheet.id === workbook.activeSheetId);
}

export function normalizeSpreadsheetWorkbook(value: unknown): SpreadsheetWorkbook {
  if (!validateSpreadsheetWorkbook(value)) {
    return createDefaultSpreadsheetWorkbook();
  }
  return {
    version: 1,
    activeSheetId: value.activeSheetId,
    sheets: value.sheets.map((sheet) => ({
      ...sheet,
      name: normalizeName(sheet.name, "Sheet"),
      data: sheet.data,
      cellStyles: sheet.cellStyles || [],
      merges: sheet.merges || [],
      fixedRowsTop: sheet.fixedRowsTop || 0,
      fixedColumnsLeft: sheet.fixedColumnsLeft || 0,
      rowHeights: sheet.rowHeights || [],
      colWidths: sheet.colWidths || [],
    })),
  };
}

export function buildSpreadsheetPreview(workbook: SpreadsheetWorkbook): string {
  const values: string[] = [];

  for (const sheet of workbook.sheets) {
    for (const row of sheet.data) {
      for (const cell of row) {
        if (cell === null || cell === "") continue;
        values.push(String(cell));
        if (values.length >= PREVIEW_LIMIT) return values.join(" ");
      }
    }
  }

  return values.join(" ");
}
