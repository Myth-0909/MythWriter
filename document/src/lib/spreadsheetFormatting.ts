import type { SpreadsheetCellValue, SpreadsheetNumberFormat } from "@/types";

function numericValue(value: SpreadsheetCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatSpreadsheetCellDisplay(
  value: SpreadsheetCellValue | undefined,
  numberFormat: SpreadsheetNumberFormat | undefined
) {
  if (value === null || value === undefined || value === "") return "";
  if (!numberFormat || numberFormat === "general") return String(value);

  if (numberFormat === "date") {
    const text = String(value);
    const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return isoDate || text;
  }

  const numeric = numericValue(value);
  if (numeric === null) return String(value);

  if (numberFormat === "currency") {
    return `¥${numeric.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (numberFormat === "percent") {
    return `${(numeric * 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  return numeric.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
