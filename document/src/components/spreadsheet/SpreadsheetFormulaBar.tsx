import { useEffect, useState, type KeyboardEvent } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Input } from "@/components/ui/input";

export interface SpreadsheetFormulaBarState {
  cellLabel: string;
  value: string;
}

interface SpreadsheetFormulaBarProps {
  state: SpreadsheetFormulaBarState;
  onNavigateToCell: (address: string) => boolean;
  onCommitFormulaValue: (value: string) => void;
}

export function SpreadsheetFormulaBar({ state, onNavigateToCell, onCommitFormulaValue }: SpreadsheetFormulaBarProps) {
  const { t } = useI18n();
  const [nameDraft, setNameDraft] = useState(state.cellLabel);
  const [valueDraft, setValueDraft] = useState(state.value);

  useEffect(() => {
    setNameDraft(state.cellLabel);
  }, [state.cellLabel]);

  useEffect(() => {
    setValueDraft(state.value);
  }, [state.value]);

  const commitNameBox = () => {
    const accepted = onNavigateToCell(nameDraft);
    if (!accepted) setNameDraft(state.cellLabel);
  };

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitNameBox();
  };

  const commitValue = () => {
    if (valueDraft !== state.value) onCommitFormulaValue(valueDraft);
  };

  const handleValueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitValue();
  };

  return (
    <div
      data-spreadsheet-formula-bar
      className="flex min-h-10 shrink-0 items-center gap-2 border-b border-surface-200 bg-white px-3 py-1 dark:border-surface-800 dark:bg-surface-950"
    >
      <Input
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value.toUpperCase())}
        onBlur={commitNameBox}
        onKeyDown={handleNameKeyDown}
        aria-label={t("sheets.nameBox")}
        placeholder={t("sheets.nameBoxPlaceholder")}
        className="h-8 w-24 shrink-0 text-center text-sm font-semibold uppercase"
      />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-surface-200 bg-surface-50 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300">
        fx
      </div>
      <Input
        value={valueDraft}
        onChange={(event) => setValueDraft(event.target.value)}
        onBlur={commitValue}
        onKeyDown={handleValueKeyDown}
        aria-label={t("sheets.formulaBar")}
        placeholder={t("sheets.formulaInputPlaceholder")}
        className="h-8 min-w-0 flex-1 font-mono text-sm"
      />
    </div>
  );
}
