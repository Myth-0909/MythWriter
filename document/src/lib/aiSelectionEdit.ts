export function isSelectionSnapshotCurrent(currentText: string, originalText: string): boolean {
  return currentText === originalText;
}

export function isSelectionEditContextCurrent(params: {
  expectedDocumentId?: string;
  currentDocumentId?: string;
  expectedFrom: number;
  expectedTo: number;
  currentFrom: number;
  currentTo: number;
  originalText: string;
  currentText: string;
}): boolean {
  return params.expectedDocumentId === params.currentDocumentId
    && params.expectedFrom === params.currentFrom
    && params.expectedTo === params.currentTo
    && isSelectionSnapshotCurrent(params.currentText, params.originalText);
}

export function plainTextToEditorHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, "<br>");
}
