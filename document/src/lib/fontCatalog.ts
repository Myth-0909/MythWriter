import type { TranslationKey } from "@/components/I18nProvider";

export const DEFAULT_FONT_FAMILY_KEY = "current";

export const DEFAULT_PROJECT_FONT_STACK =
  "\"DM Serif Display\", \"Noto Serif SC\", \"Songti SC\", \"SimSun\", \"STIX Two Text\", \"Times New Roman\", serif";

type FontSource = "current" | "adobe" | "local";
type FontMood = "serif" | "sans" | "mono" | "handwriting";

export const FONT_OPTIONS = [
  {
    key: DEFAULT_FONT_FAMILY_KEY,
    labelKey: "settings.font.current",
    previewKey: "settings.font.preview.current",
    moodKey: "settings.font.mood.classic",
    cssFamily: DEFAULT_PROJECT_FONT_STACK,
    source: "current",
    mood: "serif",
  },
  {
    key: "source-han-serif-sc",
    labelKey: "settings.font.sourceHanSerif",
    previewKey: "settings.font.preview.serif",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"source-han-serif-sc\", \"Source Han Serif SC\", \"Noto Serif SC\", \"Songti SC\", serif",
    source: "adobe",
    mood: "serif",
  },
  {
    key: "source-han-sans-sc",
    labelKey: "settings.font.sourceHanSans",
    previewKey: "settings.font.preview.sans",
    moodKey: "settings.font.mood.sans",
    cssFamily: "\"source-han-sans-sc\", \"Source Han Sans SC\", \"Noto Sans SC\", \"PingFang SC\", sans-serif",
    source: "adobe",
    mood: "sans",
  },
  {
    key: "source-han-mono-sc",
    labelKey: "settings.font.sourceHanMono",
    previewKey: "settings.font.preview.mono",
    moodKey: "settings.font.mood.mono",
    cssFamily: "\"source-han-mono-sc\", \"Source Han Mono SC\", \"Noto Sans Mono CJK SC\", monospace",
    source: "adobe",
    mood: "mono",
  },
  {
    key: "adobe-song-std",
    labelKey: "settings.font.adobeSong",
    previewKey: "settings.font.preview.longform",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"adobe-song-std\", \"Adobe Song Std\", \"Songti SC\", \"Noto Serif SC\", serif",
    source: "adobe",
    mood: "serif",
  },
  {
    key: "adobe-kaiti-std",
    labelKey: "settings.font.adobeKaiti",
    previewKey: "settings.font.preview.handwriting",
    moodKey: "settings.font.mood.handwriting",
    cssFamily: "\"adobe-kaiti-std\", \"Adobe Kaiti Std\", \"Kaiti SC\", \"STKaiti\", serif",
    source: "adobe",
    mood: "handwriting",
  },
  {
    key: "adobe-fangsong-std",
    labelKey: "settings.font.adobeFangsong",
    previewKey: "settings.font.preview.notes",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"adobe-fangsong-std\", \"Adobe Fangsong Std\", \"STFangsong\", \"FangSong\", serif",
    source: "adobe",
    mood: "serif",
  },
  {
    key: "adobe-heiti-std",
    labelKey: "settings.font.adobeHeiti",
    previewKey: "settings.font.preview.interface",
    moodKey: "settings.font.mood.sans",
    cssFamily: "\"adobe-heiti-std\", \"Adobe Heiti Std\", \"Heiti SC\", \"PingFang SC\", sans-serif",
    source: "adobe",
    mood: "sans",
  },
  {
    key: "pingfang-sc",
    labelKey: "settings.font.pingfang",
    previewKey: "settings.font.preview.interface",
    moodKey: "settings.font.mood.sans",
    cssFamily: "\"PingFang SC\", \"Hiragino Sans GB\", \"Noto Sans SC\", sans-serif",
    source: "local",
    mood: "sans",
  },
  {
    key: "microsoft-yahei",
    labelKey: "settings.font.yahei",
    previewKey: "settings.font.preview.sans",
    moodKey: "settings.font.mood.sans",
    cssFamily: "\"Microsoft YaHei\", \"Noto Sans SC\", sans-serif",
    source: "local",
    mood: "sans",
  },
  {
    key: "songti-sc",
    labelKey: "settings.font.songti",
    previewKey: "settings.font.preview.longform",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"Songti SC\", \"STSong\", \"Noto Serif SC\", serif",
    source: "local",
    mood: "serif",
  },
  {
    key: "kaiti-sc",
    labelKey: "settings.font.kaiti",
    previewKey: "settings.font.preview.handwriting",
    moodKey: "settings.font.mood.handwriting",
    cssFamily: "\"Kaiti SC\", \"STKaiti\", \"KaiTi\", serif",
    source: "local",
    mood: "handwriting",
  },
  {
    key: "fangsong-sc",
    labelKey: "settings.font.fangsong",
    previewKey: "settings.font.preview.notes",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"STFangsong\", \"FangSong\", \"Noto Serif SC\", serif",
    source: "local",
    mood: "serif",
  },
  {
    key: "noto-sans-sc",
    labelKey: "settings.font.notoSans",
    previewKey: "settings.font.preview.sans",
    moodKey: "settings.font.mood.sans",
    cssFamily: "\"Noto Sans SC\", \"PingFang SC\", sans-serif",
    source: "local",
    mood: "sans",
  },
  {
    key: "noto-serif-sc",
    labelKey: "settings.font.notoSerif",
    previewKey: "settings.font.preview.serif",
    moodKey: "settings.font.mood.serif",
    cssFamily: "\"Noto Serif SC\", \"Songti SC\", serif",
    source: "local",
    mood: "serif",
  },
  {
    key: "georgia-serif",
    labelKey: "settings.font.georgia",
    previewKey: "settings.font.preview.western",
    moodKey: "settings.font.mood.serif",
    cssFamily: "Georgia, \"Times New Roman\", \"Songti SC\", serif",
    source: "local",
    mood: "serif",
  },
  {
    key: "system-ui",
    labelKey: "settings.font.systemUi",
    previewKey: "settings.font.preview.system",
    moodKey: "settings.font.mood.sans",
    cssFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif",
    source: "local",
    mood: "sans",
  },
  {
    key: "mono",
    labelKey: "settings.font.mono",
    previewKey: "settings.font.preview.mono",
    moodKey: "settings.font.mood.mono",
    cssFamily: "\"SFMono-Regular\", \"Cascadia Mono\", \"Menlo\", \"Noto Sans Mono CJK SC\", monospace",
    source: "local",
    mood: "mono",
  },
] as const satisfies readonly {
  key: string;
  labelKey: TranslationKey;
  previewKey: TranslationKey;
  moodKey: TranslationKey;
  cssFamily: string;
  source: FontSource;
  mood: FontMood;
}[];

export type FontFamilyKey = (typeof FONT_OPTIONS)[number]["key"];

export function isFontFamilyKey(value: string): value is FontFamilyKey {
  return FONT_OPTIONS.some((option) => option.key === value);
}

export function getFontOption(key: string) {
  return FONT_OPTIONS.find((option) => option.key === key) ?? FONT_OPTIONS[0];
}
