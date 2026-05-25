export function t(lang: string, zh: string, en: string): string {
  return lang === "en" ? en : zh;
}
