import type { SpreadsheetCellColor } from "@/types";

type ColorRole = "text" | "fill";

const LEGACY_TEXT_COLORS: Record<string, string> = {
  red: "#dc2626",
  green: "#059669",
  blue: "#2563eb",
  amber: "#b45309",
  gray: "#52525b",
};

const LEGACY_FILL_COLORS: Record<string, string> = {
  red: "#fee2e2",
  green: "#d1fae5",
  blue: "#dbeafe",
  amber: "#fef3c7",
  gray: "#f4f4f5",
};

function expandShortHex(value: string) {
  return `#${value.slice(1).split("").map((char) => `${char}${char}`).join("")}`;
}

export function normalizeSpreadsheetColor(value: unknown): SpreadsheetCellColor | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "default" || text === "transparent") return undefined;
  if (text in LEGACY_TEXT_COLORS) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return expandShortHex(text);
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^[0-9a-f]{6}$/.test(text)) return `#${text}`;
  return undefined;
}

export function resolveSpreadsheetColor(
  value: SpreadsheetCellColor | undefined,
  role: ColorRole
) {
  const normalized = normalizeSpreadsheetColor(value);
  if (!normalized) return undefined;
  if (normalized.startsWith("#")) return normalized;
  return role === "fill" ? LEGACY_FILL_COLORS[normalized] : LEGACY_TEXT_COLORS[normalized];
}
