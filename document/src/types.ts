export interface Document {
  id: string;
  title: string;
  content: string;
  preview: string;
  category: DocumentCategory;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  userId?: string;
  groupId?: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  userId: string;
  title: string;
  content: string;
  preview?: string | null;
  source: string;
  createdAt: string;
}

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

export interface Spreadsheet {
  id: string;
  title: string;
  data: SpreadsheetWorkbook;
  preview?: string | null;
  isDeleted: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  userId?: string;
  groupId?: string | null;
}

export type WorkRecordPeriod = "daily" | "weekly" | "monthly";

export interface WorkRecord {
  id: string;
  userId: string;
  period: WorkRecordPeriod;
  targetDate: string;
  title: string;
  content: string;
  aiSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory = "design" | "journal" | "planning" | "research" | "general";

export const categoryLabels: Record<DocumentCategory, { zh: string; en: string }> = {
  design: { zh: "设计", en: "Design" },
  journal: { zh: "日记", en: "Journal" },
  planning: { zh: "规划", en: "Planning" },
  research: { zh: "研究", en: "Research" },
  general: { zh: "通用", en: "General" },
};

export const categoryIcons: Record<DocumentCategory, string> = {
  design: "Palette",
  journal: "Lightbulb",
  planning: "Target",
  research: "Search",
  general: "FileText",
};

// Maps category to i18n card.* key
export const categoryI18nKey: Record<DocumentCategory, "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general"> = {
  design: "card.design",
  journal: "card.journal",
  planning: "card.planning",
  research: "card.research",
  general: "card.general",
};

export const categoryColors: Record<DocumentCategory, string> = {
  design: "bg-amber-100 text-amber-600",
  journal: "bg-green-100 text-green-600",
  planning: "bg-red-100 text-red-600",
  research: "bg-cyan-100 text-cyan-600",
  general: "bg-brand-100 text-brand-600",
};
