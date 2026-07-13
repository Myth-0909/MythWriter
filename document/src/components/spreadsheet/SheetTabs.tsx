import { Plus, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpreadsheetSheet } from "@/types";

interface SheetTabsProps {
  sheets: SpreadsheetSheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onDeleteSheet: (sheetId: string) => void;
}

export function SheetTabs({ sheets, activeSheetId, onSelectSheet, onAddSheet, onDeleteSheet }: SheetTabsProps) {
  const { t } = useI18n();

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-t border-surface-200 bg-surface-50 px-2 dark:border-surface-800 dark:bg-surface-900">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {sheets.map((sheet) => {
          const active = sheet.id === activeSheetId;
          return (
            <div
              key={sheet.id}
              className={cn(
                "flex h-7 max-w-[190px] items-center rounded-md border border-transparent",
                active
                  ? "bg-white text-surface-950 shadow-sm dark:bg-surface-800 dark:text-surface-50"
                  : "text-surface-600 hover:bg-white/70 dark:text-surface-300 dark:hover:bg-surface-800"
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSelectSheet(sheet.id)}
                className="h-7 min-w-0 flex-1 justify-start px-3 text-xs"
              >
                <span className="truncate">{sheet.name}</span>
              </Button>
              {sheets.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("sheets.deleteSheet")}
                  onClick={() => onDeleteSheet(sheet.id)}
                  className="mr-1 h-5 w-5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onAddSheet} aria-label={t("sheets.addSheet")}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
