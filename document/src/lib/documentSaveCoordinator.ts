/** Coordinates editor autosave with external AI/document writes. */

export const DOCUMENT_EXTERNAL_WRITE_EVENT = "znwriter-document-external-write";
export const DOCUMENT_FLUSH_AUTOSAVE_EVENT = "znwriter-document-flush-autosave";

export type DocumentExternalWriteDetail = {
  docId: string;
  content: string;
};

export type DocumentAutosaveFlushDetail = {
  docId: string;
  handled: boolean;
  complete: (success: boolean) => void;
};

export function notifyDocumentExternalWrite(docId: string, content: string): void {
  if (typeof window === "undefined" || !docId) return;
  window.dispatchEvent(
    new CustomEvent<DocumentExternalWriteDetail>(DOCUMENT_EXTERNAL_WRITE_EVENT, {
      detail: { docId, content },
    })
  );
}

export function cancelPendingDocumentAutosave(docId: string): void {
  if (typeof window === "undefined" || !docId) return;
  window.dispatchEvent(
    new CustomEvent("znwriter-document-cancel-autosave", { detail: { docId } })
  );
}

export function requestDocumentAutosaveFlush(docId: string, timeoutMs = 10_000): Promise<boolean> {
  if (typeof window === "undefined" || !docId) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(success);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    const detail: DocumentAutosaveFlushDetail = {
      docId,
      handled: false,
      complete: finish,
    };
    window.dispatchEvent(new CustomEvent<DocumentAutosaveFlushDetail>(DOCUMENT_FLUSH_AUTOSAVE_EVENT, { detail }));
    if (!detail.handled) finish(true);
  });
}

export function createSerialDocumentSaveCoordinator() {
  let chain: Promise<void> = Promise.resolve();
  const latestRevision = new Map<string, number>();

  return {
    enqueue(docId: string, save: () => Promise<void>): Promise<{
      success: boolean;
      isLatest: boolean;
      error?: unknown;
    }> {
      const revision = (latestRevision.get(docId) || 0) + 1;
      latestRevision.set(docId, revision);
      const operation = chain
        .catch(() => {})
        .then(async () => {
          try {
            await save();
            return { success: true, error: undefined };
          } catch (error) {
            return { success: false, error };
          }
        });
      chain = operation.then(() => {});
      return operation.then((result) => ({
        ...result,
        isLatest: latestRevision.get(docId) === revision,
      }));
    },
  };
}
