import * as XLSX from "xlsx";
import type { SpreadsheetCellValue, SpreadsheetWorkbook } from "./spreadsheetWorkbook.ts";
import { createSpreadsheetSheet } from "./spreadsheetWorkbook.ts";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function safeSheetName(name: string, index: number) {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || `Sheet ${index + 1}`).slice(0, 31);
}

function trimEmptyRows(data: SpreadsheetCellValue[][]) {
  let lastRow = data.length - 1;
  while (lastRow >= 0) {
    const row = data[lastRow] || [];
    if (row.some((cell) => cell !== null && cell !== "")) break;
    lastRow -= 1;
  }
  return data.slice(0, lastRow + 1);
}

export function workbookToXlsxBlob(workbook: SpreadsheetWorkbook): Blob {
  const xlsxWorkbook = XLSX.utils.book_new();

  workbook.sheets.forEach((sheet, index) => {
    const worksheet = XLSX.utils.aoa_to_sheet(trimEmptyRows(sheet.data));
    XLSX.utils.book_append_sheet(xlsxWorkbook, worksheet, safeSheetName(sheet.name, index));
  });

  const bytes = XLSX.write(xlsxWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([bytes], { type: XLSX_MIME });
}

export function workbookFromXlsxArrayBuffer(buffer: ArrayBuffer): SpreadsheetWorkbook {
  const parsed = XLSX.read(buffer, { type: "array", cellFormula: true, cellStyles: true });
  const sheets = parsed.SheetNames.map((name) => {
    const sheet = createSpreadsheetSheet(name);
    const worksheet = parsed.Sheets[name];
    sheet.data = XLSX.utils.sheet_to_json<SpreadsheetCellValue[]>(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });
    return sheet;
  });

  if (sheets.length === 0) {
    const sheet = createSpreadsheetSheet();
    return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
  }

  return {
    version: 1,
    activeSheetId: sheets[0].id,
    sheets,
  };
}
