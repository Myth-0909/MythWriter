import type { AgentDoneEvent } from "../api";

export const AGENT_WRITE_DRAFT_KEY = "znwriter_agent_write_draft";

export type StoredAgentWriteDraft = {
  goal: string;
  stylePrompt: string;
  wordCount: string;
  includeBrain: boolean;
  includeDocuments: boolean;
  includeJournal: boolean;
  includeWeb: boolean;
  selectedDocIds: string[];
  selectedBrainIds: string[];
  selectedJournalIds: string[];
  result?: AgentDoneEvent;
  savedAt: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((item) => String(item || "").trim()).filter(Boolean)
  )).slice(0, 100);
}

function cleanResult(value: unknown): AgentDoneEvent | undefined {
  const raw = asRecord(value);
  const content = String(raw?.content || "").trim().slice(0, 200_000);
  if (!raw || !content) return undefined;

  const analysisRaw = asRecord(raw.analysis);
  const reviewRaw = asRecord(raw.review);
  const outline = Array.isArray(raw.outline) ? raw.outline : [];
  const suggestions = Array.isArray(reviewRaw?.suggestions) ? reviewRaw.suggestions : [];
  const sources = Array.isArray(raw.sources) ? raw.sources : [];

  return {
    docId: typeof raw.docId === "string" && raw.docId.trim() ? raw.docId.trim() : null,
    title: String(raw.title || "").trim().slice(0, 200),
    content,
    analysis: {
      genre: String(analysisRaw?.genre || "").slice(0, 200),
      tone: String(analysisRaw?.tone || "").slice(0, 200),
      themes: Array.isArray(analysisRaw?.themes)
        ? analysisRaw.themes.map((item) => String(item).slice(0, 200)).slice(0, 20)
        : [],
      estimatedWords: Number.isFinite(Number(analysisRaw?.estimatedWords))
        ? Number(analysisRaw?.estimatedWords)
        : 0,
    },
    outline: outline
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .map((item) => ({
        heading: String(item.heading || "").slice(0, 300),
        brief: String(item.brief || "").slice(0, 1_000),
      }))
      .filter((item) => item.heading.trim())
      .slice(0, 30),
    review: {
      score: Math.max(0, Math.min(100, Number(reviewRaw?.score) || 0)),
      suggestions: suggestions
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => !!item)
        .map((item) => {
          const severity: "high" | "medium" | "low" =
            item.severity === "high" || item.severity === "medium" ? item.severity : "low";
          return {
            detail: String(item.detail || "").slice(0, 1_000),
            severity,
          };
        })
        .filter((item) => item.detail.trim())
        .slice(0, 30),
    },
    sources: sources
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => !!item)
      .filter((item) => item.type === "brain" || item.type === "document" || item.type === "journal" || item.type === "web")
      .map((item) => ({
        type: item.type as "brain" | "document" | "journal" | "web",
        id: String(item.id || "").slice(0, 200),
        title: String(item.title || "").slice(0, 300),
        excerpt: String(item.excerpt || "").slice(0, 1_000),
        score: Number.isFinite(Number(item.score)) ? Number(item.score) : undefined,
        degraded: item.degraded === true,
      }))
      .slice(0, 30),
  };
}

export function serializeStoredAgentWriteDraft(draft: StoredAgentWriteDraft): string {
  const result = draft.result
    ? cleanResult({
        ...draft.result,
        // Recovery only needs source identity. Avoid duplicating excerpts from
        // other private documents in browser storage.
        sources: (draft.result.sources || []).map((source) => ({ ...source, excerpt: "" })),
      })
    : undefined;
  return JSON.stringify({ ...draft, result });
}

export function getAgentWriteDraftStorageKey(userId: string): string | null {
  const scope = String(userId || "").trim();
  return scope ? `${AGENT_WRITE_DRAFT_KEY}:${scope}` : null;
}

export function parseStoredAgentWriteDraft(raw: string | null): StoredAgentWriteDraft | null {
  if (!raw) return null;
  try {
    const value = asRecord(JSON.parse(raw));
    if (!value) return null;
    const wordCount = String(value.wordCount || "600").replace(/\D/g, "").slice(0, 5) || "600";
    return {
      goal: String(value.goal || "").slice(0, 4_000),
      stylePrompt: String(value.stylePrompt || "").slice(0, 120),
      wordCount,
      includeBrain: value.includeBrain === true,
      includeDocuments: value.includeDocuments === true,
      includeJournal: value.includeJournal === true,
      includeWeb: value.includeWeb === true,
      selectedDocIds: cleanIds(value.selectedDocIds),
      selectedBrainIds: cleanIds(value.selectedBrainIds),
      selectedJournalIds: cleanIds(value.selectedJournalIds),
      result: cleanResult(value.result),
      savedAt: Number.isFinite(Number(value.savedAt)) ? Number(value.savedAt) : 0,
    };
  } catch {
    return null;
  }
}
