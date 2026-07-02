import { RAG_SCORE_THRESHOLD } from "./ragService";

export type ChatReference = {
  type?: string;
  id?: string;
  title?: string;
  auto?: boolean | string;
  score?: number | string;
};

function isAutoReference(ref: ChatReference) {
  return ref.auto === true || ref.auto === "true";
}

export function selectReferencedBrainIds(references: ChatReference[] | undefined): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];

  for (const ref of Array.isArray(references) ? references : []) {
    if (ref?.type !== "brain" || typeof ref.id !== "string") continue;

    const id = ref.id.trim();
    if (!id || seen.has(id)) continue;

    if (isAutoReference(ref)) {
      const score = Number(ref.score);
      if (!Number.isFinite(score) || score <= RAG_SCORE_THRESHOLD) continue;
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}
