import { ArrowLeft, ArrowRight, Copy, MoreHorizontal, Plus, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SpreadsheetSheet } from "@/types";

interface SheetTabsProps {
  sheets: SpreadsheetSheet[];
  activeSheetId: string;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onDeleteSheet: (sheetId: string) => void;
  onRenameSheet: (sheetId: string, name: string) => void;
  onDuplicateSheet: (sheetId: string) => void;
  onMoveSheet: (sheetId: string, direction: -1 | 1) => void;
}

export function SheetTabs({
  sheets,
  activeSheetId,
  onSelectSheet,
  onAddSheet,
  onDeleteSheet,
  onRenameSheet,
  onDuplicateSheet,
  onMoveSheet,
}: SheetTabsProps) {
  const { t } = useI18n();
  const [renameState, setRenameState] = useState<{ sheetId: string; name: string } | null>(null);

  const submitRename = () => {
    if (!renameState) return;
    onRenameSheet(renameState.sheetId, renameState.name);
    setRenameState(null);
  };

  return (
    <>
      <div
        data-sheet-tabs
        className="flex h-9 shrink-0 items-center gap-1 border-t border-surface-200 bg-surface-50 px-2 dark:border-surface-800 dark:bg-surface-900"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {sheets.map((sheet, index) => {
            const active = sheet.id === activeSheetId;
            return (
              <div
                key={sheet.id}
                className={cn(
                  "flex h-7 max-w-[220px] items-center rounded-md border border-transparent",
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("sheets.formatMenu")}
                      className="mr-1 h-5 w-5 text-surface-400 hover:text-surface-700 dark:hover:text-surface-100"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[180px]">
                    <DropdownMenuItem onSelect={() => setRenameState({ sheetId: sheet.id, name: sheet.name })}>
                      {t("sheets.renameSheet")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onDuplicateSheet(sheet.id)}>
                      <Copy className="h-4 w-4" />
                      {t("sheets.duplicateSheet")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={index === 0} onSelect={() => onMoveSheet(sheet.id, -1)}>
                      <ArrowLeft className="h-4 w-4" />
                      {t("sheets.moveSheetLeft")}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={index === sheets.length - 1} onSelect={() => onMoveSheet(sheet.id, 1)}>
                      <ArrowRight className="h-4 w-4" />
                      {t("sheets.moveSheetRight")}
                    </DropdownMenuItem>
                    {sheets.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => onDeleteSheet(sheet.id)}>
                          <X className="h-4 w-4" />
                          {t("sheets.deleteSheet")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onAddSheet} aria-label={t("sheets.addSheet")}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={!!renameState} onOpenChange={(open) => !open && setRenameState(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sheets.renameSheet")}</DialogTitle>
            <DialogDescription>{t("sheets.sheetName")}</DialogDescription>
          </DialogHeader>
          <Input
            value={renameState?.name || ""}
            onChange={(event) => setRenameState((state) => state ? { ...state, name: event.target.value } : state)}
            aria-label={t("sheets.sheetName")}
            placeholder={t("sheets.sheetNamePlaceholder")}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRenameState(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={submitRename}>
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
