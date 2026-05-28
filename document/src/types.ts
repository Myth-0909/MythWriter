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
