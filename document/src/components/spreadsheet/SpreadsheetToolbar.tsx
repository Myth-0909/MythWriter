import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Bold,
  Columns3,
  Download,
  Eraser,
  Italic,
  ListFilter,
  Merge,
  PaintBucket,
  Redo2,
  Rows3,
  Search,
  SplitSquareHorizontal,
  TableProperties,
  Trash2,
  Type,
  Underline,
  Undo2,
  Upload,
  WrapText,
} from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeSpreadsheetColor } from "@/lib/spreadsheetColors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import type {
  SpreadsheetCellColor,
  SpreadsheetFontSize,
  SpreadsheetHorizontalAlign,
  SpreadsheetNumberFormat,
  SpreadsheetVerticalAlign,
} from "@/types";

export type SpreadsheetSaveStatus = "saved" | "saving" | "unsaved" | "error";

interface SpreadsheetToolbarProps {
  status: SpreadsheetSaveStatus;
  onImport: () => void;
  onExport: () => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  importing?: boolean;
  onToggleFindReplace: () => void;
  onOpenFilterMenu: () => void;
  onClearFilters: () => void;
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
  onSetVerticalAlign: (align: SpreadsheetVerticalAlign) => void;
  onSetNumberFormat: (format: SpreadsheetNumberFormat) => void;
  onSetFontSize: (size: SpreadsheetFontSize) => void;
  onToggleBorder: () => void;
  onClearFormat: () => void;
  onInsertRowAbove: () => void;
  onInsertRowBelow: () => void;
  onInsertColumnLeft: () => void;
  onInsertColumnRight: () => void;
  onDeleteSelectedRows: () => void;
  onDeleteSelectedColumns: () => void;
  onClearSelectedCells: () => void;
  onAutoFitColumns: () => void;
  onResetColumnWidths: () => void;
  onSetRowHeight: (height: number) => void;
  onResetRowHeights: () => void;
  onSortAscending: () => void;
  onSortDescending: () => void;
  isTopRowFrozen: boolean;
  isFirstColumnFrozen: boolean;
  isFindReplaceOpen: boolean;
}

const statusKeys: Record<SpreadsheetSaveStatus, "sheets.saved" | "sheets.saving" | "sheets.unsaved" | "sheets.saveFailed"> = {
  saved: "sheets.saved",
  saving: "sheets.saving",
  unsaved: "sheets.unsaved",
  error: "sheets.saveFailed",
};

const CUSTOM_COLOR_PALETTE = [
  "#111827", "#374151", "#6b7280", "#9ca3af", "#e5e7eb", "#ffffff",
  "#dc2626", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#16a34a",
  "#059669", "#14b8a6", "#06b6d4", "#0ea5e9", "#2563eb", "#4f46e5",
  "#7c3aed", "#9333ea", "#c026d3", "#db2777", "#e11d48", "#ef4444",
  "#fee2e2", "#ffedd5", "#fef3c7", "#fef9c3", "#ecfccb", "#dcfce7",
  "#d1fae5", "#ccfbf1", "#cffafe", "#e0f2fe", "#dbeafe", "#e0e7ff",
  "#ede9fe", "#f3e8ff", "#fae8ff", "#fce7f3", "#ffe4e6", "#f4f4f5",
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

function ColorPaletteButton({
  label,
  icon,
  onSelectColor,
}: {
  label: string;
  icon: ReactNode;
  onSelectColor: (color: SpreadsheetCellColor) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draftColor, setDraftColor] = useState("#2563eb");

  const applyColor = (color: string) => {
    const normalized = normalizeSpreadsheetColor(color);
    if (!normalized) return;
    setDraftColor(normalized);
    onSelectColor(normalized);
    setOpen(false);
  };

  const applyDraftColor = () => {
    applyColor(draftColor);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onMouseDown={preserveSpreadsheetSelection}
          aria-label={label}
          title={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[264px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs font-semibold text-surface-500 dark:text-surface-400">
              {t("sheets.customColor")}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {CUSTOM_COLOR_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-7 rounded-md border border-surface-200 shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 dark:border-surface-700"
                  style={{ backgroundColor: color }}
                  aria-label={`${label} ${color}`}
                  onMouseDown={preserveSpreadsheetSelection}
                  onClick={() => applyColor(color)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draftColor}
              onChange={(event) => setDraftColor(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyDraftColor();
              }}
              aria-label={t("sheets.colorHex")}
              placeholder="#2563eb"
              spellCheck={false}
              className="h-8 font-mono text-xs"
            />
            <Button type="button" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={applyDraftColor}>
              {t("sheets.applyColor")}
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onMouseDown={preserveSpreadsheetSelection}
            onClick={() => {
              onSelectColor("default");
              setOpen(false);
            }}
          >
            {t("sheets.defaultColor")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SpreadsheetToolbar({
  status,
  onImport,
  onExport,
  onImportCsv,
  onExportCsv,
  importing = false,
  onToggleFindReplace,
  onOpenFilterMenu,
  onClearFilters,
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
  onSetVerticalAlign,
  onSetNumberFormat,
  onSetFontSize,
  onToggleBorder,
  onClearFormat,
  onInsertRowAbove,
  onInsertRowBelow,
  onInsertColumnLeft,
  onInsertColumnRight,
  onDeleteSelectedRows,
  onDeleteSelectedColumns,
  onClearSelectedCells,
  onAutoFitColumns,
  onResetColumnWidths,
  onSetRowHeight,
  onResetRowHeights,
  onSortAscending,
  onSortDescending,
  isTopRowFrozen,
  isFirstColumnFrozen,
  isFindReplaceOpen,
}: SpreadsheetToolbarProps) {
  const { t } = useI18n();
  const [rowHeightDraft, setRowHeightDraft] = useState("40");
  const statusClassName = cn(
    "min-w-[88px] text-right text-[11px] font-semibold",
    status === "saved" && "text-emerald-600 dark:text-emerald-400",
    status === "saving" && "text-brand-600 dark:text-brand-300",
    status === "unsaved" && "text-amber-600 dark:text-amber-300",
    status === "error" && "text-red-600 dark:text-red-400"
  );
  const applyCustomRowHeight = () => {
    const height = Number(rowHeightDraft);
    if (!Number.isFinite(height)) return;
    onSetRowHeight(height);
  };

  return (
    <div className="shrink-0 border-b border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900">
      <div
        data-spreadsheet-action-bar
        className="flex min-h-12 items-center gap-2 overflow-x-auto border-b border-surface-200 px-3 py-1.5 dark:border-surface-800"
      >
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={isFindReplaceOpen ? "secondary" : "outline"}
            size="sm"
            onMouseDown={preserveSpreadsheetSelection}
            onClick={onToggleFindReplace}
            className="shrink-0 gap-2"
          >
            <Search className="h-4 w-4" />
            {t("sheets.findReplace")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} className="shrink-0 gap-2">
                <ListFilter className="h-4 w-4" />
                {t("sheets.filters")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuLabel>{t("sheets.filters")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={onOpenFilterMenu}>
                <ListFilter className="h-4 w-4" />
                {t("sheets.openFilterMenu")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onClearFilters}>
                <Eraser className="h-4 w-4" />
                {t("sheets.clearFilters")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onAutoFitColumns}>
                <Columns3 className="h-4 w-4" />
                {t("sheets.autoFitColumns")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onResetColumnWidths}>
                <Columns3 className="h-4 w-4" />
                {t("sheets.resetColumnWidths")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("sheets.rowHeight")}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => onSetRowHeight(24)}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.rowHeightCompact")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSetRowHeight(40)}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.rowHeightNormal")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSetRowHeight(64)}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.rowHeightRoomy")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onSetRowHeight(96)}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.rowHeightTall")}
              </DropdownMenuItem>
              <div className="px-3 py-2">
                <div className="mb-1.5 text-xs font-semibold text-surface-500 dark:text-surface-400">
                  {t("sheets.rowHeightCustom")}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={20}
                    max={320}
                    step={1}
                    value={rowHeightDraft}
                    onChange={(event) => setRowHeightDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        applyCustomRowHeight();
                      }
                    }}
                    aria-label={t("sheets.rowHeightPixels")}
                    className="h-8 w-24"
                  />
                  <Button type="button" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={applyCustomRowHeight}>
                    {t("sheets.applyRowHeight")}
                  </Button>
                </div>
              </div>
              <DropdownMenuItem onSelect={onResetRowHeights}>
                <Rows3 className="h-4 w-4" />
                {t("sheets.resetRowHeights")}
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

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importing}
            onMouseDown={preserveSpreadsheetSelection}
            onClick={onImport}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {t("sheets.importXlsx")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={importing}
            onMouseDown={preserveSpreadsheetSelection}
            onClick={onImportCsv}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {t("sheets.importCsv")}
          </Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={onExport} className="gap-2">
            <Download className="h-4 w-4" />
            {t("sheets.exportXlsx")}
          </Button>
          <Button type="button" variant="outline" size="sm" onMouseDown={preserveSpreadsheetSelection} onClick={onExportCsv} className="gap-2">
            <Download className="h-4 w-4" />
            {t("sheets.exportCsv")}
          </Button>
          {importing && (
            <span className="shrink-0 text-[11px] font-medium text-brand-600 dark:text-brand-300">
              {t("sheets.importing")}
            </span>
          )}
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

        <ColorPaletteButton label={t("sheets.textColor")} icon={<Type className="h-4 w-4" />} onSelectColor={onSetTextColor} />
        <ColorPaletteButton label={t("sheets.fillColor")} icon={<PaintBucket className="h-4 w-4" />} onSelectColor={onSetFillColor} />

        <ToolbarIconButton label={t("sheets.fontSizeSmall")} onClick={() => onSetFontSize("small")}>
          <span className="text-[10px] font-semibold leading-none">A-</span>
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.fontSizeNormal")} onClick={() => onSetFontSize("normal")}>
          <span className="text-xs font-semibold leading-none">A</span>
        </ToolbarIconButton>
        <ToolbarIconButton label={t("sheets.fontSizeLarge")} onClick={() => onSetFontSize("large")}>
          <span className="text-sm font-semibold leading-none">A+</span>
        </ToolbarIconButton>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" onMouseDown={preserveSpreadsheetSelection} aria-label={t("sheets.formatMenu")}>
              <Type className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuLabel>{t("sheets.formatMenu")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onSetNumberFormat("general")}>{t("sheets.numberFormatGeneral")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetNumberFormat("number")}>{t("sheets.numberFormatNumber")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetNumberFormat("currency")}>{t("sheets.numberFormatCurrency")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetNumberFormat("percent")}>{t("sheets.numberFormatPercent")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetNumberFormat("date")}>{t("sheets.numberFormatDate")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSetFontSize("small")}>{t("sheets.fontSizeSmall")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetFontSize("normal")}>{t("sheets.fontSizeNormal")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetFontSize("large")}>{t("sheets.fontSizeLarge")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onSetVerticalAlign("top")}>{t("sheets.alignTop")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetVerticalAlign("middle")}>{t("sheets.alignMiddle")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onSetVerticalAlign("bottom")}>{t("sheets.alignBottom")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onToggleBorder}>{t("sheets.toggleBorder")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onClearFormat}>{t("sheets.clearFormat")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
        <ToolbarIconButton label={t("sheets.alignJustify")} onClick={() => onSetHorizontalAlign("justify")}>
          <AlignJustify className="h-4 w-4" />
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
