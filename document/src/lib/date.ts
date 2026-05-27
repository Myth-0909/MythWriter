import type { TranslationKey } from "@/components/I18nProvider";

type Lang = "zh" | "en";
type Translate = (key: TranslationKey) => string;

export function formatFullDateTime(value: string | Date | null | undefined, lang: Lang) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatRelativeModified(value: string | Date | null | undefined, t: Translate) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return t("date.justNow");
  if (diffMinutes < 60) {
    return `${diffMinutes}${t(diffMinutes === 1 ? "date.minuteAgo" : "date.minutesAgo")}`;
  }
  if (diffHours < 24) {
    return `${diffHours}${t(diffHours === 1 ? "date.hourAgo" : "date.hoursAgo")}`;
  }
  return `${diffDays}${t(diffDays === 1 ? "date.dayAgo" : "date.daysAgo")}`;
}

