export function isWritingReviewSnapshotCurrent(input: {
  requestId: number;
  latestRequestId: number;
  targetDocumentId: string;
  currentDocumentId?: string;
  targetContent: string;
  currentContent: string;
}): boolean {
  return input.requestId === input.latestRequestId
    && input.targetDocumentId === input.currentDocumentId
    && input.targetContent === input.currentContent;
}
