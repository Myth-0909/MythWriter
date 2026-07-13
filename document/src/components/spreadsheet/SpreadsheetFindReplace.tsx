import { ChevronDown, ChevronUp, Replace } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SpreadsheetFindMatch } from "@/lib/spreadsheetFindReplace";

interface SpreadsheetFindReplaceProps {
  query: string;
  replacement: string;
  matches: SpreadsheetFindMatch[];
  activeIndex: number;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplaceCurrent: () => void;
  onReplaceAll: () => void;
}

export function SpreadsheetFindReplace({
  query,
  replacement,
  matches,
  activeIndex,
  onQueryChange,
  onReplacementChange,
  onPrevious,
  onNext,
  onReplaceCurrent,
  onReplaceAll,
}: SpreadsheetFindReplaceProps) {
  const { t } = useI18n();
  const hasMatches = matches.length > 0;
  const current = hasMatches ? Math.min(activeIndex + 1, matches.length) : 0;
  const matchCount = hasMatches
    ? t("sheets.matchCount").replace("{current}", String(current)).replace("{total}", String(matches.length))
    : t("sheets.noMatches");

  return (
    <div className="flex min-h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-surface-200 bg-surface-50 px-3 py-1.5 dark:border-surface-800 dark:bg-surface-900">
      <Replace className="h-4 w-4 shrink-0 text-surface-500 dark:text-surface-400" />
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        aria-label={t("sheets.find")}
        placeholder={t("sheets.find")}
        className="h-8 w-48 shrink-0 text-xs"
      />
      <Input
        value={replacement}
        onChange={(event) => onReplacementChange(event.target.value)}
        aria-label={t("sheets.replaceWith")}
        placeholder={t("sheets.replaceWith")}
        className="h-8 w-48 shrink-0 text-xs"
      />
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" onClick={onPrevious} disabled={!hasMatches} aria-label={t("sheets.previousMatch")}>
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onNext} disabled={!hasMatches} aria-label={t("sheets.nextMatch")}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      <span className="min-w-[96px] shrink-0 text-xs font-medium text-surface-500 dark:text-surface-400">
        {matchCount}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onReplaceCurrent} disabled={!hasMatches}>
        {t("sheets.replaceCurrent")}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={onReplaceAll} disabled={!hasMatches}>
        {t("sheets.replaceAll")}
      </Button>
    </div>
  );
}
