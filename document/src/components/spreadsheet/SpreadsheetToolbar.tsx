import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Bold,
  Columns3,
  Download,
  Eraser,
  Italic,
  Merge,
  PaintBucket,
  Redo2,
  Rows3,
  SplitSquareHorizontal,
  TableProperties,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  WrapText,
} from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { SpreadsheetCellColor, SpreadsheetHorizontalAlign } from "@/types";

export type SpreadsheetSaveStatus = "saved" | "saving" | "unsaved" | "error";

interface SpreadsheetToolbarProps {
  status: SpreadsheetSaveStatus;
  onImport: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
  onToggleFreezeTopRow: () => void;
  onToggleFreezeFirstColumn: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onToggleWrap: () => void;
  onSetTextColor: (color: SpreadsheetCellColor) => void;
  onSetFillColor: (color: SpreadsheetCellColor) => void;
  onSetHorizontalAlign: (align: SpreadsheetHorizontalAlign) => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDeleteSelectedRows: () => void;
  onDeleteSelectedColumns: () => void;
  onClearSelectedCells: () => void;
  onSortAscending: () => void;
  onSortDescending: () => void;
  isTopRowFrozen: boolean;
  isFirstColumnFrozen: boolean;
}

const statusKeys: Record<SpreadsheetSaveStatus, "sheets.saved" | "sheets.saving" | "sheets.unsaved" | "sheets.saveFailed"> = {
  saved: "sheets.saved",
  saving: "sheets.saving",
  unsaved: "sheets.unsaved",
  error: "sheets.saveFailed",
};

const colorSwatches: Array<{
  color: SpreadsheetCellColor;
  labelKey:
    | "sheets.defaultColor"
    | "sheets.colorRed"
    | "sheets.colorGreen"
    | "sheets.colorBlue"
    | "sheets.colorAmber"
    | "sheets.colorGray";
  className: string;
}> = [
  { color: "default", labelKey: "sheets.defaultColor", className: "bg-white border-surface-300 dark:bg-surface-950" },
  { color: "red", labelKey: "sheets.colorRed", className: "bg-red-500 border-red-500" },
  { color: "green", labelKey: "sheets.colorGreen", className: "bg-emerald-500 border-emerald-500" },
  { color: "blue", labelKey: "sheets.colorBlue", className: "bg-blue-500 border-blue-500" },
  { color: "amber", labelKey: "sheets.colorAmber", className: "bg-amber-500 border-amber-500" },
  { color: "gray", labelKey: "sheets.colorGray", className: "bg-zinc-500 border-zinc-500" },
];

function preserveSpreadsheetSelection(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

function ToolbarIconButton({
  label,
  active = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <Button
        type="button"
        variant={active ? "secondary" : "ghost"}
        size="icon"
        onMouseDown={preserveSpreadsheetSelection}
        onClick={onClick}
        aria-label={label}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-surface-200 dark:bg-surface-800" />;
}

export function SpreadsheetToolbar({
  status,
  onImport,
  onExport,
  onUndo,
  onRedo,
  onMerge,
  onUnmerge,
  onToggleFreezeTopRow,
  onToggleFreezeFirstColumn,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onToggleWrap,
  onSetTextColor,
  onSetFillColor,
  onSetHorizontalAlign,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDeleteSelectedRows,
  onDeleteSelectedColumns,
  onClearSelectedCells,
  onSortAscending,
  onSortDescending,
  isTopRowFrozen,
  isFirstColumnFrozen,
}: SpreadsheetToolbarProps) {
  const { t } = useI18n();
  const statusClassName = cn(
    "min-w-[88px] text-right text-[11px] font-semibold",
    status === "saved" && "text-emerald-600 dark:text-emerald-400",
    status === "saving" && "text-brand-600 dark:text-brand-300",
    status === "unsaved" && "text-amber-600 dark:text-amber-300",
    status === "error" && "text-red-600 dark:text-red-400"
  );

  const colorMenu = (
    label: string,
    icon: ReactNode,
    onSelectColor: (color: SpreadsheetCellColor) => void
  ) => (
    <DropdownMenu>
      <Tooltip content={label}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" onMouseDown={preserveSpreadsheetSelection} aria-label={label}>
            {icon}
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {colorSwatches.map((item, index) => (
          <DropdownMenuItem key={item.color} index={index} onSelect={() => onSelectColor(item.color)}>
            <span className={`h-3.5 w-3.5 rounded-full border ${item.className}`} />
            {t(item.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="shrink-0 border-b border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900">
      <div
        data-spreadsheet-action-bar
        className="flex min-h-12 items-center gap-2 overflow-x-auto border-b border-surface-200 px-3 py-1.5 dark:border-surface-800"
      >
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} className="shrink-0 gap-2">
                <TableProperties className="h-4 w-4" />
                {t("sheets.structureMenu")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[220px]">
              <DropdownMenuLabel>{t("sheets.structureMenu")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onInsertRowAbove}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.insertRowAbove")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onInsertRowBelow}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.insertRowBelow")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onInsertColumnLeft}>
                <Columns3 className="h-4 w-4" />
                {t("sheets.insertColumnLeft")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onInsertColumnRight}>
                <Columns3 className="h-4 w-4" />
                {t("sheets.insertColumnRight")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onDeleteSelectedRows}>
                <Trash2 className="h-4 w-4" />
                {t("sheets.deleteRows")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDeleteSelectedColumns}>
                <Trash2 className="h-4 w-4" />
                {t("sheets.deleteColumns")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onClearSelectedCells}>
                <Eraser className="h-4 w-4" />
                {t("sheets.clearCells")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} className="shrink-0 gap-2">
                <ArrowUpAZ className="h-4 w-4" />
                {t("sheets.sortMenu")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={onSortAscending}>
                <ArrowUpAZ className="h-4 w-4" />
                {t("sheets.sortAscending")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onSortDescending}>
                <ArrowDownAZ className="h-4 w-4" />
                {t("sheets.sortDescending")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={onImport} className="gap-2">
            <Upload className="h-4 w-4" />
            {t("sheets.importXlsx")}
          </Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={onExport} className="gap-2">
            <Download className="h-4 w-4" />
            {t("sheets.exportXlsx")}
          </Button>
          <span className={statusClassName}>
            {t(statusKeys[status])}
          </span>
        </div>
      </div>

      <div
        data-spreadsheet-editing-bar
        className="flex min-h-12 items-center gap-1 overflow-x-auto px-3 py-1.5"
      >
        <ToolbarIconButton label={t("sheets.undo")} onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.redo")} onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </ToolbarIconButton>

        <ToolbarSeparator />

        <ToolbarIconButton label={t("sheets.bold")} onClick={onToggleBold}>
          <Bold className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.italic")} onClick={onToggleItalic}>
          <Italic className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.underline")} onClick={onToggleUnderline}>
          <Underline className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.wrap")} onClick={onToggleWrap}>
          <WrapText className="h-4 w-4" />
        </ToolbarIconButton>

        {colorMenu(t("sheets.textColor"), <Type className="h-4 w-4" />, onSetTextColor)}
        {colorMenu(t("sheets.fillColor"), <PaintBucket className="h-4 w-4" />, onSetFillColor)}

        <ToolbarSeparator />

        <ToolbarIconButton label={t("sheets.alignLeft")} onClick={() => onSetHorizontalAlign("left")}>
          <AlignLeft className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.alignCenter")} onClick={() => onSetHorizontalAlign("center")}>
          <AlignCenter className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.alignRight")} onClick={() => onSetHorizontalAlign("right")}>
          <AlignRight className="h-4 w-4" />
        </ToolbarIconButton>

        <ToolbarSeparator />

        <ToolbarIconButton label={t("sheets.merge")} onClick={onMerge}>
          <Merge className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.unmerge")} onClick={onUnmerge}>
          <SplitSquareHorizontal className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.freezeTopRow")} active={isTopRowFrozen} onClick={onToggleFreezeTopRow}>
          <Rows3 className="h-4 w-4" />
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.freezeFirstColumn")} active={isFirstColumnFrozen} onClick={onToggleFreezeFirstColumn}>
          <Columns3 className="h-4 w-4" />
        </ToolbarIconButton>
      </div>
    </div>
  );
}
