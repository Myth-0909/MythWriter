export const DEFAULT_FONT_FAMILY_KEY = "current";

export const FONT_FAMILY_KEYS = [
  DEFAULT_FONT_FAMILY_KEY,
  "source-han-serif-sc",
  "source-han-sans-sc",
  "source-han-mono-sc",
  "adobe-song-std",
  "adobe-kaiti-std",
  "adobe-fangsong-std",
  "adobe-heiti-std",
  "pingfang-sc",
  "microsoft-yahei",
  "songti-sc",
  "kaiti-sc",
  "fangsong-sc",
  "noto-sans-sc",
  "noto-serif-sc",
  "georgia-serif",
  "system-ui",
  "mono",
] as const;

export type FontFamilyKey = (typeof FONT_FAMILY_KEYS)[number];

export function normalizeFontFamilyKey(value: unknown): FontFamilyKey | null {
  if (typeof value !== "string") return null;
  return (FONT_FAMILY_KEYS as readonly string[]).includes(value)
    ? (value as FontFamilyKey)
    : null;
}
