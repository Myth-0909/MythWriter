import { Columns3, Download, Merge, Redo2, Rows3, Save, SplitSquareHorizontal, Undo2, Upload } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export type SpreadsheetSaveStatus = "saved" | "saving" | "unsaved" | "error";

interface SpreadsheetToolbarProps {
  status: SpreadsheetSaveStatus;
  canSave: boolean;
  onSave: () => void;
  onImport: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onToggleFreezeTopRow: () => void;
  onToggleFreezeFirstColumn: () => void;
  isTopRowFrozen: boolean;
  isFirstColumnFrozen: boolean;
}

const statusKeys: Record<SpreadsheetSaveStatus, "sheets.saved" | "sheets.saving" | "sheets.unsaved" | "sheets.saveFailed"> = {
  saved: "sheets.saved",
  saving: "sheets.saving",
  unsaved: "sheets.unsaved",
  error: "sheets.saveFailed",
};

export function SpreadsheetToolbar({
  status,
  canSave,
  onSave,
  onImport,
  onExport,
  onUndo,
  onRedo,
  onMerge,
  onUnmerge,
  onToggleFreezeTopRow,
  onToggleFreezeFirstColumn,
  isTopRowFrozen,
  isFirstColumnFrozen,
}: SpreadsheetToolbarProps) {
  const { t } = useI18n();

  const iconButtons = [
    { label: t("sheets.undo"), icon: Undo2, onClick: onUndo },
    { label: t("sheets.redo"), icon: Redo2, onClick: onRedo },
    { label: t("sheets.merge"), icon: Merge, onClick: onMerge },
    { label: t("sheets.unmerge"), icon: SplitSquareHorizontal, onClick: onUnmerge },
    { label: t("sheets.freezeTopRow"), icon: Rows3, onClick: onToggleFreezeTopRow, active: isTopRowFrozen },
    { label: t("sheets.freezeFirstColumn"), icon: Columns3, onClick: onToggleFreezeFirstColumn, active: isFirstColumnFrozen },
  ];

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-surface-200 bg-surface-50 px-3 dark:border-surface-800 dark:bg-surface-900">
      <Button type="button" size="sm" onClick={onSave} disabled={!canSave} className="gap-2">
        <Save className="h-4 w-4" />
        {t("sheets.saveNow")}
      </Button>
      <div className="mx-1 h-5 w-px bg-surface-200 dark:bg-surface-800" />
      {iconButtons.map((item) => (
        <Tooltip key={item.label} content={item.label}>
          <Button
            type="button"
            variant={item.active ? "secondary" : "ghost"}
            size="icon"
            onClick={item.onClick}
            aria-label={item.label}
          >
            <item.icon className="h-4 w-4" />
          </Button>
        </Tooltip>
      ))}
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onImport} className="gap-2">
          <Upload className="h-4 w-4" />
          {t("sheets.importXlsx")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onExport} className="gap-2">
          <Download className="h-4 w-4" />
          {t("sheets.exportXlsx")}
        </Button>
        <span className="min-w-[88px] text-right text-[11px] text-surface-500 dark:text-surface-400">
          {t(statusKeys[status])}
        </span>
      </div>
    </div>
  );
}
