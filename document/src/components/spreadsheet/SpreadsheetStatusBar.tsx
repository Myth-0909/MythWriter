import { useI18n } from "@/components/I18nProvider";
import type { SpreadsheetSelectionSummary } from "@/lib/spreadsheetSelectionStats";

interface SpreadsheetStatusBarProps {
  summary: SpreadsheetSelectionSummary | null;
}

function formatNumber(value: number | null) {
  if (value === null) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function SpreadsheetStatusBar({ summary }: SpreadsheetStatusBarProps) {
  const { t } = useI18n();
  const current = summary || {
    rangeLabel: "A1",
    cellCount: 1,
    numberCount: 0,
    sum: null,
    average: null,
    min: null,
    max: null,
  };

  const items = [
    [t("sheets.statusRange"), current.rangeLabel],
    [t("sheets.statusCount"), String(current.cellCount)],
    [t("sheets.statusNumbers"), String(current.numberCount)],
    [t("sheets.statusSum"), formatNumber(current.sum)],
    [t("sheets.statusAverage"), formatNumber(current.average)],
    [t("sheets.statusMin"), formatNumber(current.min)],
    [t("sheets.statusMax"), formatNumber(current.max)],
  ];

  return (
    <div className="flex min-h-9 shrink-0 items-center gap-4 overflow-x-auto border-t border-surface-200 bg-surface-50 px-3 text-[11px] text-surface-600 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-300">
      {items.map(([label, value]) => (
        <span key={label} className="shrink-0">
          <span className="font-medium text-surface-500 dark:text-surface-400">{label}</span>
          <span className="ml-1 font-semibold text-surface-800 dark:text-surface-100">{value}</span>
        </span>
      ))}
    </div>
  );
}
