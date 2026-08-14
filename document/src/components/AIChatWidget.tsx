import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check, CheckCircle2, ChevronDown, Clock3, Copy, CopyCheck, FileSpreadsheet, FileText, History, MessageSquarePlus, Pencil, RotateCcw, SendHorizontal, Smile, Sparkles, Square, Star, ThumbsDown, ThumbsUp, Trash2, X, XCircle } from "lucide-react";
import catAvatar from "@/assets/cat-avatar.png";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Scrollbar } from "@/components/ui/scrollbar";
import { InlineLoading } from "@/components/LoadingSpinner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { renderAiChatHtml } from "@/lib/aiChatHtml";
import { markdownToHtml } from "@/lib/markdown";
import { getServerAssetUrl } from "@/lib/apiBase";
import {
  AI_CHAT_TYPEWRITER_INTERVAL_MS,
  canSendAssistantFeedback,
  getTypewriterChunkSize,
  normalizeChatToolCallId,
  resolveAssistantActionContent,
  resolveChatFinalContent,
  sanitizeAssistantDisplayContent,
  resolveStoredAssistantContent,
} from "@/lib/aiChatStream";
import { streamChat } from "@/lib/aiChatClient";
import { buildDiffLines, htmlToPlainText, summarizeDiff, type DiffLine } from "@/lib/aiChatDiff";
import {
  escapeRegExp,
  getBrainQuery,
  getMentionQuery,
  getSlashQuery,
  parseToolArguments,
  textMentionsTitle,
} from "@/lib/aiChatInputQueries";
import { shouldAttachCurrentWorkspace } from "@/lib/aiChatIntent";
import {
  cancelPendingDocumentAutosave,
  notifyDocumentExternalWrite,
  requestDocumentAutosaveFlush,
} from "@/lib/documentSaveCoordinator";
import { type ToolCallEvent } from "@/lib/aiChatApiMessages";
import {
  buildConversationTitle,
  clearLegacyUnscopedAiChatCache,
  clearLocalMemoryCache,
  createClientConversationId,
  hasMeaningfulUserTurn,
  hydrateMessagesFromServer,
  loadActiveConversationId,
  loadLocalMemoryCache,
  saveActiveConversationId,
  saveLocalMemoryCache,
  shouldPreferServerConversation,
} from "@/lib/aiChatMemory";
import {
  openAiModelConfig,
  resolveAiReadiness,
  type AiReadinessStatus,
} from "@/lib/aiReadiness";
import { applyDocumentPatchesPreferHtml } from "@/lib/documentAiPatch";
import { applySpreadsheetPatch, type SpreadsheetPatchAction } from "@/lib/spreadsheetAiPatch";
import {
  buildToolMemoryContent,
  isDocumentActionBaselineCurrent,
  isSpreadsheetActionBaselineCurrent,
  resolveActionDisplayContent,
  resolveActionFailureContent,
} from "@/lib/aiActionState";
import { Tooltip } from "@/components/ui/tooltip";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIChatSessionsMenu } from "@/components/ai-chat/AIChatSessionsMenu";
import { SpreadsheetPatchPreview } from "@/components/spreadsheet/SpreadsheetPatchPreview";
import type { DocumentVersion, Spreadsheet, SpreadsheetWorkbook } from "@/types";
import type { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import gsap from "gsap";

type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

function safePersonality(raw: string | null): Personality {
  if (raw && VALID_PERSONALITIES.includes(raw as Personality)) return raw as Personality;
  return "normal";
}

const PERSONALITY_OPTIONS = [
  { key: "normal" as const, labelKey: "ai.personality.normal" as const, emoji: "✨" },
  { key: "cute" as const, labelKey: "ai.personality.cute" as const, emoji: "🌸" },
  { key: "catgirl" as const, labelKey: "ai.personality.catgirl" as const, emoji: "🐱" },
  { key: "serious" as const, labelKey: "ai.personality.serious" as const, emoji: "📋" },
  { key: "silly" as const, labelKey: "ai.personality.silly" as const, emoji: "🤪" },
];

const PERSONALITY_KEY = "znwriter_ai_personality";
const AUTO_RAG_KEY = "znwriter_ai_auto_rag";
const WORKSPACE_CONTEXT_KEY = "znwriter_ai_workspace_context";
const AUTO_RAG_SCORE_THRESHOLD = 0.3;
const MAX_CHAT_INPUT_CHARS = 12_000;

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  finalContent?: string;
  isTyping?: boolean;
  interrupted?: boolean;
  thinking?: string;
  toolCalls?: ToolCallEvent[];
  tool_call_id?: string;
  sources?: ChatReference[];
  timestamp?: string;
}

interface ChatReference {
  type: "document" | "brain" | "spreadsheet";
  id: string;
  title: string;
  auto?: boolean;
  score?: number;
}

type DocumentReference = ChatReference & { type: "document" };
type BrainReference = ChatReference & { type: "brain"; auto?: boolean; score?: number };
type SpreadsheetReference = ChatReference & { type: "spreadsheet" };

interface BrainKnowledge {
  id: string;
  title: string;
  description: string;
  category: string;
}

interface AIChatWidgetProps {
  currentDocumentId?: string;
  currentSpreadsheetId?: string;
}

type SlashCommand = {
  id: string;
  label: string;
  prompt: string;
};

type TaskStage = "idle" | "analyzing" | "generating" | "preview" | "snapshot" | "verify" | "done";

type PendingDocumentUpdate = {
  docId: string;
  title: string;
  previousTitle: string;
  previousHtml: string;
  nextMarkdown: string;
  nextHtml: string;
  diffLines: DiffLine[];
  stats: {
    added: number;
    removed: number;
    unchanged: number;
  };
};

type PendingCreateDocument = {
  title: string;
  markdown: string;
  html: string;
  createdDocId?: string;
};

type PendingSpreadsheetPatch = {
  spreadsheetId: string;
  title: string;
  previousWorkbook: SpreadsheetWorkbook;
  nextWorkbook: SpreadsheetWorkbook;
  summary: string;
  operationCount: number;
};

type SpreadsheetUndoState = {
  spreadsheetId: string;
  title: string;
  workbook: SpreadsheetWorkbook;
  expectedCurrentTitle: string;
  expectedCurrentWorkbook: SpreadsheetWorkbook;
};

interface Position {
  x: number;
  y: number;
}

interface AnchoredPosition {
  side: "left" | "right";
  yPercent: number; // 0-100, percentage from top
}

function anchoredToAbsolute(anchor: AnchoredPosition, dockToDocumentEditor = false): Position {
  const MARGIN = 16;
  const btnSize = 62;
  const maxX = window.innerWidth - btnSize - MARGIN;
  let x = anchor.side === "left" ? MARGIN : maxX;
  if (anchor.side === "right" && dockToDocumentEditor && window.innerWidth >= 1600) {
    const editorSurface = document.querySelector<HTMLElement>("[data-document-editor-surface]");
    if (editorSurface) {
      const rect = editorSurface.getBoundingClientRect();
      const readingCanvasWidth = Math.min(880, rect.width);
      const canvasRight = rect.left + (rect.width + readingCanvasWidth) / 2;
      x = Math.max(MARGIN, Math.min(maxX, canvasRight + 12));
    }
  }
  const maxY = window.innerHeight - btnSize - MARGIN;
  const y = Math.max(MARGIN, Math.min(maxY, MARGIN + (maxY - MARGIN) * (anchor.yPercent / 100)));
  return { x, y };
}

function absoluteToAnchored(pos: Position): AnchoredPosition {
  const MARGIN = 16;
  const btnSize = 62;
  const maxX = window.innerWidth - btnSize - MARGIN;
  const side: "left" | "right" = pos.x < maxX / 2 ? "left" : "right";
  const maxY = window.innerHeight - btnSize - MARGIN;
  const yPercent = Math.max(0, Math.min(100, ((pos.y - MARGIN) / (maxY - MARGIN)) * 100));
  return { side, yPercent };
}

function saveMemory(scope: string, messages: Message[]) {
  // Local storage is a write-through cache only; server Conversation is source of truth.
  saveLocalMemoryCache(scope, messages as Array<{ role: string; content: string; finalContent?: string; isTyping?: boolean }>);
}

function uniqueReferences<T extends ChatReference>(refs: T[]) {
  return refs.filter(
    (ref, index, all) => all.findIndex((item) => `${item.type}:${item.id}` === `${ref.type}:${ref.id}`) === index
  );
}

function formatTimestamp(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

export function AIChatWidget({ currentDocumentId, currentSpreadsheetId }: AIChatWidgetProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const {
    createDocument,
    documents,
    getDocument,
    loadDocument,
    updateDocument,
    listDocumentVersions,
    createDocumentVersion,
    restoreDocumentVersion,
    refreshDocuments,
  } = useDocuments();
  const { user } = useAuth();
  const memoryScope = user?.id || "";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [personality, setPersonality] = useState<Personality>(() =>
    safePersonality(localStorage.getItem(PERSONALITY_KEY))
  );
  const personalityRef = useRef(personality);
  const [personalityOpen, setPersonalityOpen] = useState(false);
  const memoryRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const typewriterControlRef = useRef<{ skip: () => void } | null>(null);
  const sentHistoryRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const draftBeforeHistoryRef = useRef<string>("");
  const [feedbackMsgIdx, setFeedbackMsgIdx] = useState<number | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [showDislikeOpts, setShowDislikeOpts] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [closingRating, setClosingRating] = useState(false);
  const [closingDislike, setClosingDislike] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<number>>(new Set());
  const [deleteMsgConfirm, setDeleteMsgConfirm] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => createClientConversationId());
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; updatedAt?: string }>>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const feedbackDoneRef = useRef<Set<number>>(new Set());
  const restoredRef = useRef(false);
  const [keyOk, setKeyOk] = useState(false);
  const [readinessStatus, setReadinessStatus] = useState<"checking" | AiReadinessStatus>("checking");
  const [references, setReferences] = useState<DocumentReference[]>([]);
  const [activeSpreadsheet, setActiveSpreadsheet] = useState<Spreadsheet | null>(null);
  const [brainReferences, setBrainReferences] = useState<BrainReference[]>([]);
  const [autoBrainReferences, setAutoBrainReferences] = useState<BrainReference[]>([]);
  const [autoReferenceEnabled, setAutoReferenceEnabled] = useState(() => localStorage.getItem(AUTO_RAG_KEY) !== "0");
  const [workspaceContextEnabled, setWorkspaceContextEnabled] = useState(() => localStorage.getItem(WORKSPACE_CONTEXT_KEY) !== "0");
  const [autoReferenceLoading, setAutoReferenceLoading] = useState(false);
  const [brainKnowledges, setBrainKnowledges] = useState<BrainKnowledge[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionIdxRef = useRef(0);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainIndex, setBrainIndex] = useState(0);
  const brainIdxRef = useRef(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const commandIdxRef = useRef(0);
  const [pendingUpdate, setPendingUpdate] = useState<PendingDocumentUpdate | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<PendingCreateDocument | null>(null);
  const [applyingCreate, setApplyingCreate] = useState(false);
  const [pendingSpreadsheetPatch, setPendingSpreadsheetPatch] = useState<PendingSpreadsheetPatch | null>(null);
  const [applyingSpreadsheetPatch, setApplyingSpreadsheetPatch] = useState(false);
  const [spreadsheetUndo, setSpreadsheetUndo] = useState<SpreadsheetUndoState | null>(null);
  const [confirmClosePending, setConfirmClosePending] = useState(false);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSaveCountRef = useRef(0);
  const chatViewEpochRef = useRef(0);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [taskStage, setTaskStage] = useState<TaskStage>("idle");
  const autoSearchSeq = useRef(0);

  useEffect(() => {
    if (memoryScope) clearLegacyUnscopedAiChatCache();
    chatViewEpochRef.current += 1;
    abortRef.current?.abort();
    restoredRef.current = false;
    const scopedConversationId = loadActiveConversationId(memoryScope) || createClientConversationId();
    setConversationId(scopedConversationId);
    setMessages([]);
    memoryRef.current = [];
    setSessions([]);
    setLoading(false);
    setStreaming(false);
    setIsActing(false);
  }, [memoryScope]);

  // Automatically clear references when the corresponding document is deleted/removed
  useEffect(() => {
    if (references.length === 0) return;
    setReferences((prev) => {
      const activeIds = new Set(documents.map((d) => d.id));
      const next = prev.filter((ref) => activeIds.has(ref.id));
      if (next.length !== prev.length) {
        return next;
      }
      return prev;
    });
  }, [documents, references]);

  useEffect(() => {
    if (!open || brainKnowledges.length > 0) return;
    api.listBrainKnowledges()
      .then((res) => setBrainKnowledges(res.knowledges || []))
      .catch(() => setBrainKnowledges([]));
  }, [brainKnowledges.length, open]);

  useEffect(() => {
    if (!currentSpreadsheetId) {
      setActiveSpreadsheet(null);
      return;
    }
    let cancelled = false;
    api.getSpreadsheet(currentSpreadsheetId)
      .then((res) => {
        if (!cancelled) setActiveSpreadsheet(res.spreadsheet);
      })
      .catch(() => {
        if (!cancelled) setActiveSpreadsheet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSpreadsheetId]);

  useEffect(() => {
    const query = input.trim();
    const brainQuery = getBrainQuery(input);
    // Only embed while the user is actively picking brain refs (#…), not on every keystroke.
    if (!open || !autoReferenceEnabled || loading || streaming || !brainQuery || brainQuery.query.length < 1) {
      if (!brainQuery) setAutoBrainReferences([]);
      setAutoReferenceLoading(false);
      return;
    }

    const searchQuery = brainQuery.query.trim() || query;
    if (searchQuery.length < 1) {
      setAutoBrainReferences([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const seq = autoSearchSeq.current + 1;
      autoSearchSeq.current = seq;
      setAutoReferenceLoading(true);
      try {
        const res = await api.searchRagKnowledge({ query: searchQuery, topK: 3 });
        if (autoSearchSeq.current !== seq) return;
        const manualIds = new Set(brainReferences.map((ref) => ref.id));
        const suggestions = (res.degraded ? [] : res.results)
          .filter((item) => !manualIds.has(item.knowledgeId || item.id))
          .filter((item) => item.score > AUTO_RAG_SCORE_THRESHOLD)
          .slice(0, 3)
          .map((item) => ({
            type: "brain" as const,
            id: item.knowledgeId || item.id,
            title: item.title,
            auto: true,
            score: item.score,
          }));
        setAutoBrainReferences(uniqueReferences(suggestions));
      } catch {
        if (autoSearchSeq.current === seq) setAutoBrainReferences([]);
      } finally {
        if (autoSearchSeq.current === seq) setAutoReferenceLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [input, open, autoReferenceEnabled, loading, streaming, brainReferences]);

  const queueConversationSave = useCallback(async (
    normalizedMessages: Message[],
    targetConversationId: string,
    targetPersonality: Personality
  ) => {
    pendingSaveCountRef.current += 1;
    setSaving(true);

    const queuedSave = saveChainRef.current.then(async () => {
      try {
        const res = await api.saveConversation({
          messages: normalizedMessages,
          personality: targetPersonality,
          conversationId: targetConversationId,
        });
        if (res.conversation?.id) {
          const title = buildConversationTitle(normalizedMessages, t("ai.sessionUntitled"));
          setSessions((prev) => {
            const rest = prev.filter((item) => item.id !== res.conversation.id);
            return [{ id: res.conversation.id, title, updatedAt: new Date().toISOString() }, ...rest].slice(0, 30);
          });
          if (conversationIdRef.current === targetConversationId) {
            setConversationId(res.conversation.id);
            saveActiveConversationId(memoryScope, res.conversation.id);
            saveMemory(memoryScope, normalizedMessages as Message[]);
          }
        }
      } catch (err) {
        console.warn("[ai] Failed to save conversation:", err);
      } finally {
        pendingSaveCountRef.current = Math.max(0, pendingSaveCountRef.current - 1);
        if (pendingSaveCountRef.current === 0) setSaving(false);
      }
    });
    saveChainRef.current = queuedSave;
    await queuedSave;
  }, [memoryScope, t]);

  // Save conversation to DB (filters out incomplete streaming messages)
  const saveConversation = useCallback(async () => {
    if (messages.length === 0) return;
    // If currently streaming, exclude the last incomplete assistant message
    const msgsToSave = (loading || streaming)
      ? messages.filter((m, i) => {
          if (i === messages.length - 1 && m.role === "assistant" && m.isTyping && !m.finalContent) return false;
          if (i === messages.length - 1 && m.role === "assistant" && !m.content && !m.finalContent) return false;
          return true;
        })
      : messages;
    if (msgsToSave.length === 0 || !hasMeaningfulUserTurn(msgsToSave)) return;
    const normalizedMessages = msgsToSave.map((message) => {
      if (message.role !== "assistant") return message;
      const { finalContent, isTyping, ...rest } = message;
      return {
        ...rest,
        content: resolveStoredAssistantContent({
          displayContent: message.content,
          finalContent,
        }),
      };
    });
    saveMemory(memoryScope, normalizedMessages as Message[]);
    await queueConversationSave(normalizedMessages as Message[], conversationId, personalityRef.current);
  }, [conversationId, loading, messages, queueConversationSave, streaming]);

  // Drag - restore saved position. Older left-side defaults are migrated once so
  // the launcher no longer sits on top of the primary navigation.
  const [pos, setPos] = useState<Position>(() => {
    try {
      const storageVersion = localStorage.getItem("chat-btn-pos-version");
      if (storageVersion !== "2") {
        const nextAnchor: AnchoredPosition = { side: "right", yPercent: 88 };
        localStorage.setItem("chat-btn-pos-version", "2");
        localStorage.setItem("chat-btn-pos", JSON.stringify(nextAnchor));
        return anchoredToAbsolute(nextAnchor, Boolean(currentDocumentId));
      }
      const saved = localStorage.getItem("chat-btn-pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          // Support new edge-anchored format
          if (parsed.side && typeof parsed.yPercent === "number") {
            return anchoredToAbsolute(parsed as AnchoredPosition, Boolean(currentDocumentId));
          }
          // Normalize legacy absolute positions into the responsive edge format.
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            const anchor = absoluteToAnchored({ x: parsed.x, y: parsed.y });
            localStorage.setItem("chat-btn-pos", JSON.stringify(anchor));
            return anchoredToAbsolute(anchor, Boolean(currentDocumentId));
          }
        }
    } catch {}
    return anchoredToAbsolute({ side: "right", yPercent: 88 }, Boolean(currentDocumentId));
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const messagesScrollbarRef = useRef<OverlayScrollbarsComponentRef>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const forceLatestOnOpenRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollTimersRef = useRef<number[]>([]);
  const senderRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  // User avatar
  const avatarUrl = getServerAssetUrl(user?.avatar ? `/uploads/${user.avatar}` : null);
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  // Resize handler: recalculate position from stored anchor
  useEffect(() => {
    const updatePos = () => {
      try {
        const saved = localStorage.getItem("chat-btn-pos");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.side && typeof parsed.yPercent === "number") {
            setPos(anchoredToAbsolute(parsed as AnchoredPosition, Boolean(currentDocumentId)));
            return;
          }
          if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
            const anchor = absoluteToAnchored({ x: parsed.x, y: parsed.y });
            localStorage.setItem("chat-btn-pos", JSON.stringify(anchor));
            setPos(anchoredToAbsolute(anchor, Boolean(currentDocumentId)));
            return;
          }
        }
      } catch {}
      // Fallback: clamp to viewport
      setPos((prev) => ({
        x: Math.min(prev.x, window.innerWidth - 60),
        y: Math.min(prev.y, window.innerHeight - 60),
      }));
    };
    window.addEventListener("resize", updatePos);
    const frame = window.requestAnimationFrame(updatePos);
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const attachEditorObserver = () => {
      const editorSurface = document.querySelector<HTMLElement>("[data-document-editor-surface]");
      if (!editorSurface) return false;
      updatePos();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(updatePos);
        resizeObserver.observe(editorSurface);
      }
      return true;
    };
    if (!attachEditorObserver() && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        if (attachEditorObserver()) mutationObserver?.disconnect();
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      window.removeEventListener("resize", updatePos);
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [currentDocumentId]);

  // On close: abort any ongoing stream, save, and clean up state. On open: check API key.
  useEffect(() => {
    if (!open) {
      chatViewEpochRef.current += 1;
      // Abort any ongoing stream first
      if (abortRef.current) {
        abortRef.current.abort();
      }
      // Save conversation (the helper filters incomplete streaming messages)
      saveConversation();
      // Clean up all UI state
      restoredRef.current = false;
      setKeyOk(false);
      setReadinessStatus("checking");
      setPendingUpdate(null);
      setTaskStage("idle");
      setLoading(false);
      setStreaming(false);
      setIsActing(false);
      return;
    }
    let cancelled = false;
    setReadinessStatus("checking");
    resolveAiReadiness(() => api.getApiKey()).then((status) => {
      if (!cancelled) {
        setReadinessStatus(status);
        setKeyOk(status === "ready");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // On keyOk: restore from DB or greet. On personality change: re-greet.
  useEffect(() => {
    if (!open || !keyOk || !memoryScope) return;
    // Log open
    api.logActivity({ action: "chat_open", detail: personalityRef.current }).catch(() => {});

    // Prefer server conversations; local cache is fallback only.
    if (!restoredRef.current) {
      restoredRef.current = true;
      const requestEpoch = chatViewEpochRef.current + 1;
      chatViewEpochRef.current = requestEpoch;
      const preferredId = loadActiveConversationId(memoryScope);
      const localCache = loadLocalMemoryCache(memoryScope) as Message[];
      api.getConversations().then((res) => {
        if (requestEpoch !== chatViewEpochRef.current) return;
        const list = (res.conversations || [])
          .filter((item) => hasMeaningfulUserTurn(item.messages))
          .map((item) => ({
          id: item.id,
          title: buildConversationTitle(item.messages as Message[], t("ai.sessionUntitled")),
          updatedAt: item.updatedAt || item.createdAt,
          messages: hydrateMessagesFromServer(item.messages) as Message[],
        }));
        setSessions(list.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })));

        const preferred = preferredId ? list.find((item) => item.id === preferredId) : undefined;
        const chosen = preferred || list[0];
        if (chosen && shouldPreferServerConversation(chosen.messages, localCache, !!preferred)) {
          setConversationId(chosen.id);
          saveActiveConversationId(memoryScope, chosen.id);
          setMessages(chosen.messages);
          memoryRef.current = chosen.messages;
          saveMemory(memoryScope, chosen.messages);
          return;
        }
        if (localCache.length > 0) {
          const localConversationId = preferredId || createClientConversationId();
          setConversationId(localConversationId);
          saveActiveConversationId(memoryScope, localConversationId);
          setMessages(localCache);
          memoryRef.current = localCache;
          return;
        }
        const nextConversationId = createClientConversationId();
        setConversationId(nextConversationId);
        saveActiveConversationId(memoryScope, nextConversationId);
        greetUser(requestEpoch);
      }).catch(() => {
        if (requestEpoch !== chatViewEpochRef.current) return;
        if (localCache.length > 0) {
          const localConversationId = preferredId || createClientConversationId();
          setConversationId(localConversationId);
          saveActiveConversationId(memoryScope, localConversationId);
          setMessages(localCache);
          memoryRef.current = localCache;
          return;
        }
        const nextConversationId = createClientConversationId();
        setConversationId(nextConversationId);
        saveActiveConversationId(memoryScope, nextConversationId);
        greetUser(requestEpoch);
      });
    }
  }, [keyOk, memoryScope, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // When personality changes mid-conversation, add a subtle system note.
  // Do NOT re-greet — that would clear the current conversation.
  useEffect(() => {
    if (!open || !restoredRef.current) return;
    if (!hasMeaningfulUserTurn(memoryRef.current)) return;
    const pers = personalityRef.current;
    const option = PERSONALITY_OPTIONS.find((o) => o.key === pers);
    const note = t("ai.personalityChanged").replace("{emoji}", option?.emoji || "").replace("{label}", option ? t(option.labelKey) : pers);
    setMessages((prev) => {
      // Don't add duplicate notes if the last message is already a personality change note
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && lastMsg.content === note) return prev;
      return [...prev, { role: "assistant", content: note, timestamp: formatTimestamp() }];
    });
  }, [personality]); // eslint-disable-line react-hooks/exhaustive-deps

  const greetUser = useCallback((requestEpoch?: number) => {
    const greetingEpoch = requestEpoch ?? (chatViewEpochRef.current + 1);
    chatViewEpochRef.current = greetingEpoch;
    const pers = personalityRef.current;
    const ts = formatTimestamp();
    const applyGreeting = (content: string) => {
      if (greetingEpoch !== chatViewEpochRef.current) return;
      const greeting = { role: "assistant" as const, content, timestamp: ts };
      setMessages([greeting]);
      memoryRef.current = [greeting];
      saveMemory(memoryScope, memoryRef.current);
    };
    api.aiGreeting({ userName: user?.name || "", personality: pers })
      .then((res) => {
        applyGreeting(res.greeting);
      })
      .catch(() => {
        const name = user?.name || t("common.user");
        const formatGreeting = (template: string) => template.replace("{name}", name);
        const fallbacks: Record<Personality, string> = {
          normal: formatGreeting(t("ai.fallbackGreetingNormal")),
          cute: formatGreeting(t("ai.fallbackGreetingCute")),
          catgirl: formatGreeting(t("ai.fallbackGreetingCatgirl")),
          serious: formatGreeting(t("ai.fallbackGreetingSerious")),
          silly: formatGreeting(t("ai.fallbackGreetingSilly")),
        };
        applyGreeting(fallbacks[pers] || fallbacks.normal);
      });
  }, [memoryScope, t, user?.name]);

  // Handle scroll events for smart scroll detection
  const handleScrollEvent = useCallback((_instance: any, event: Event) => {
    if (forceLatestOnOpenRef.current) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const marker = chatEndRef.current;
    const instance = messagesScrollbarRef.current?.osInstance();
    instance?.update(true);

    const elements = instance?.elements();
    const scrollElement = elements?.scrollOffsetElement || elements?.viewport;
    if (scrollElement) {
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior });
      return;
    }

    if (!marker) return;
    marker.scrollIntoView({ behavior, block: "end" });
  }, []);

  const clearScheduledChatScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    scrollTimersRef.current.forEach(window.clearTimeout);
    scrollTimersRef.current = [];
  }, []);

  const scheduleChatScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    clearScheduledChatScroll();
    scrollFrameRef.current = requestAnimationFrame(() => scrollChatToBottom(behavior));
    scrollTimersRef.current = [40, 120, 280, 520].map((delay) =>
      window.setTimeout(() => scrollChatToBottom(behavior), delay)
    );
  }, [clearScheduledChatScroll, scrollChatToBottom]);

  // Smart auto-scroll: only scroll to bottom if user is near the bottom
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    scrollChatToBottom();
  }, [messages, scrollChatToBottom]);

  // Always show the most recent messages when the assistant opens.
  useEffect(() => {
    if (!open || !keyOk || messages.length === 0) return;
    forceLatestOnOpenRef.current = true;
    userScrolledUpRef.current = false;
    scheduleChatScrollToBottom();

    const release = window.setTimeout(() => {
      forceLatestOnOpenRef.current = false;
    }, 760);

    return () => {
      window.clearTimeout(release);
      clearScheduledChatScroll();
    };
  }, [clearScheduledChatScroll, keyOk, messages.length, open, scheduleChatScrollToBottom]);

  // Reset scroll lock when user sends a new message
  useEffect(() => {
    if (loading) userScrolledUpRef.current = false;
  }, [loading]);

  useEffect(() => {
    const inputElement = chatInputRef.current;
    if (!inputElement) return;
    inputElement.style.height = "0px";
    inputElement.style.height = `${Math.max(52, Math.min(160, inputElement.scrollHeight))}px`;
  }, [input, open]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (!detail?.text) return;
      setInput(detail.text.slice(0, MAX_CHAT_INPUT_CHARS));
      setOpen(true);
    };
    window.addEventListener("znwriter-ai-chat-prefill", handler);
    return () => window.removeEventListener("znwriter-ai-chat-prefill", handler);
  }, []);

  const startNewChat = useCallback(async () => {
    if (loading || streaming) return;
    if (pendingUpdate || pendingCreate || pendingSpreadsheetPatch) {
      toast(t("ai.finishPreviewFirst"), "info");
      return;
    }
    await saveConversation();
    const nextConversationId = createClientConversationId();
    const requestEpoch = chatViewEpochRef.current + 1;
    chatViewEpochRef.current = requestEpoch;
    setConversationId(nextConversationId);
    saveActiveConversationId(memoryScope, nextConversationId);
    setMessages([]);
    memoryRef.current = [];
    saveMemory(memoryScope, []);
    setSessionsOpen(false);
    setPendingUpdate(null);
    setPendingCreate(null);
    setPendingSpreadsheetPatch(null);
    setEditMode(false);
    setSelectedMsgs(new Set());
    greetUser(requestEpoch);
  }, [greetUser, loading, memoryScope, pendingCreate, pendingSpreadsheetPatch, pendingUpdate, saveConversation, streaming, t, toast]);

  const switchConversation = useCallback(async (id: string) => {
    if (loading || streaming || id === conversationId) {
      setSessionsOpen(false);
      return;
    }
    if (pendingUpdate || pendingCreate || pendingSpreadsheetPatch) {
      setSessionsOpen(false);
      toast(t("ai.finishPreviewFirst"), "info");
      return;
    }
    await saveConversation();
    const requestEpoch = chatViewEpochRef.current + 1;
    chatViewEpochRef.current = requestEpoch;
    try {
      const res = await api.getConversations();
      if (requestEpoch !== chatViewEpochRef.current) return;
      const match = (res.conversations || []).find((item) => item.id === id);
      if (!match) {
        toast(t("ai.sessionDeleteFailed"), "error");
        return;
      }
      const msgs = hydrateMessagesFromServer(match.messages) as Message[];
      setConversationId(match.id);
      saveActiveConversationId(memoryScope, match.id);
      setMessages(msgs);
      memoryRef.current = msgs;
      saveMemory(memoryScope, msgs);
      setSessionsOpen(false);
      toast(t("ai.sessionSwitched"), "success");
    } catch {
      if (requestEpoch !== chatViewEpochRef.current) return;
      toast(t("ai.sessionDeleteFailed"), "error");
    }
  }, [conversationId, loading, memoryScope, pendingCreate, pendingSpreadsheetPatch, pendingUpdate, saveConversation, streaming, t, toast]);

  const deleteSession = useCallback(async (id: string) => {
    if (id === conversationId && (pendingUpdate || pendingCreate || pendingSpreadsheetPatch)) {
      toast(t("ai.finishPreviewFirst"), "info");
      return;
    }
    try {
      await saveChainRef.current;
      await api.deleteConversation(id);
      setSessions((prev) => prev.filter((item) => item.id !== id));
      if (conversationId === id) {
        const nextConversationId = createClientConversationId();
        const requestEpoch = chatViewEpochRef.current + 1;
        chatViewEpochRef.current = requestEpoch;
        setConversationId(nextConversationId);
        saveActiveConversationId(memoryScope, nextConversationId);
        setMessages([]);
        memoryRef.current = [];
        saveMemory(memoryScope, []);
        greetUser(requestEpoch);
      }
      toast(t("ai.sessionDeleted"), "success");
    } catch {
      toast(t("ai.sessionDeleteFailed"), "error");
    }
  }, [conversationId, greetUser, memoryScope, pendingCreate, pendingSpreadsheetPatch, pendingUpdate, t, toast]);

  const changePersonality = useCallback((p: Personality) => {
    personalityRef.current = p;
    setPersonality(p);
    setPersonalityOpen(false);
    localStorage.setItem(PERSONALITY_KEY, p);
    if (!hasMeaningfulUserTurn(memoryRef.current)) {
      const requestEpoch = chatViewEpochRef.current + 1;
      chatViewEpochRef.current = requestEpoch;
      setMessages([]);
      memoryRef.current = [];
      greetUser(requestEpoch);
    }
  }, [greetUser]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (open) return;
    setDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...posRef.current };
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch {
      // ignore capture failures on older webviews
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const mm = (e: PointerEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true;
      const btnSize = 62;
      const newX = Math.max(0, Math.min(window.innerWidth - btnSize, posStart.current.x + dx));
      const newY = Math.max(0, Math.min(window.innerHeight - btnSize, posStart.current.y + dy));
      posRef.current = { x: newX, y: newY };
      setPos({ x: newX, y: newY });
    };
    const mu = (e: PointerEvent) => {
      setDragging(false);
      if (!hasMoved.current) {
        setOpen(true);
      } else {
        // Snap to nearest edge
        const MARGIN = 16;
        const btnSize = 62;
        const maxX = window.innerWidth - btnSize - MARGIN;
        const maxY = window.innerHeight - btnSize - MARGIN;
        const currentX = posStart.current.x + (e.clientX - dragStart.current.x);
        const currentY = posStart.current.y + (e.clientY - dragStart.current.y);
        const distLeft = currentX - MARGIN;
        const distRight = maxX - currentX;
        const snapX = distLeft < distRight ? MARGIN : maxX;
        const snapY = Math.max(MARGIN, Math.min(maxY, currentY));
        const anchored = absoluteToAnchored({ x: snapX, y: snapY });
        const snapped = anchoredToAbsolute(anchored, Boolean(currentDocumentId));
        posRef.current = snapped;
        setPos(snapped);
        // Store as edge-anchored responsive format
        try { localStorage.setItem("chat-btn-pos", JSON.stringify(anchored)); } catch {}
      }
    };
    window.addEventListener("pointermove", mm);
    window.addEventListener("pointerup", mu);
    window.addEventListener("pointercancel", mu);
    return () => {
      window.removeEventListener("pointermove", mm);
      window.removeEventListener("pointerup", mu);
      window.removeEventListener("pointercancel", mu);
    };
  }, [currentDocumentId, dragging]);

  // Core send logic — reusable for both normal send and regenerate
  const doSend = useCallback(async (text: string) => {
    if (!text || loading || streaming) return;
    const requestEpoch = chatViewEpochRef.current + 1;
    chatViewEpochRef.current = requestEpoch;
    const isCurrentRequest = () => chatViewEpochRef.current === requestEpoch;

    // Intercept /write command: open agent panel instead of sending to chat
    const writeMatch = text.match(/^\/write\s+(.+)/);
    if (writeMatch) {
      window.dispatchEvent(new CustomEvent("znwriter-agent-write-open", { detail: { goal: writeMatch[1].trim() } }));
      setInput("");
      return;
    }

    const currentDocument = currentDocumentId ? getDocument(currentDocumentId) : undefined;
    const hasManualReferences =
      references.length > 0 ||
      brainReferences.length > 0 ||
      autoBrainReferences.length > 0 ||
      documents.some((doc) => textMentionsTitle(text, doc.title, "@")) ||
      brainKnowledges.some((item) => textMentionsTitle(text, item.title, "#"));
    const attachWorkspace = workspaceContextEnabled && shouldAttachCurrentWorkspace(text, { hasManualReferences });
    const currentReference = attachWorkspace && currentDocument && !currentDocument.isDeleted
      ? [{ type: "document" as const, id: currentDocument.id, title: currentDocument.title }]
      : [];
    const currentSpreadsheet = attachWorkspace && currentSpreadsheetId
      ? activeSpreadsheet || await api.getSpreadsheet(currentSpreadsheetId).then((res) => res.spreadsheet).catch(() => null)
      : null;
    if (!isCurrentRequest()) return;
    if (currentSpreadsheet) setActiveSpreadsheet(currentSpreadsheet);
    const currentSpreadsheetReference = currentSpreadsheet && !currentSpreadsheet.isDeleted
      ? [{ type: "spreadsheet" as const, id: currentSpreadsheet.id, title: currentSpreadsheet.title }]
      : [];
    const referencedByText = documents
      .filter((doc) => textMentionsTitle(text, doc.title, "@"))
      .map((doc) => ({ type: "document" as const, id: doc.id, title: doc.title }));
    const referencedBrainsByText = brainKnowledges
      .filter((item) => textMentionsTitle(text, item.title, "#"))
      .map((item) => ({ type: "brain" as const, id: item.id, title: item.title }));
    const requestReferences: ChatReference[] = uniqueReferences([...currentReference, ...currentSpreadsheetReference, ...references, ...referencedByText, ...brainReferences, ...autoBrainReferences, ...referencedBrainsByText]);

    const userMsg: Message = { role: "user", content: text, timestamp: formatTimestamp() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    // Track sent message for ArrowUp history navigation
    sentHistoryRef.current = [text, ...sentHistoryRef.current.filter(h => h !== text)].slice(0, 30);
    historyIndexRef.current = -1;
    draftBeforeHistoryRef.current = "";
    setReferences([]);
    setBrainReferences([]);
    setAutoBrainReferences([]);
    setMentionOpen(false);
    setBrainOpen(false);
    setCommandOpen(false);
    setLoading(true);
    setTaskStage("idle");
    api.logActivity({ action: "chat_send", detail: text.slice(0, 100) }).catch(() => {});

    const memory = [...memoryRef.current, userMsg];
    memoryRef.current = memory;

    const abort = new AbortController();
    abortRef.current = abort;
    let typewriterTimer: number | null = null;
    let streamedPartial = "";
    let activeTypewriterControl: { skip: () => void } | null = null;

    try {
      // The full conversation is already sent as structured `messages`; avoid
      // duplicating it as a text blob in the system prompt (halves token cost).
      const memoryContext = "";
      let fullContent = "";
      let latestToolCalls: ToolCallEvent[] = [];
      let assistantStarted = false;
      let displayedContent = "";
      let targetContent = "";

      const upsertAssistantMessage = (patch: Partial<Message>) => {
        if (!isCurrentRequest()) return;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, ...patch, sources: requestReferences };
          } else {
            next.push({
              role: "assistant",
              content: "",
              sources: requestReferences,
              timestamp: formatTimestamp(),
              ...patch,
            });
          }
          return next;
        });
      };

      const scheduleTypewriter = () => {
        if (typewriterTimer !== null) return;
        typewriterTimer = window.setTimeout(() => {
          typewriterTimer = null;
          if (!isCurrentRequest()) return;
          if (displayedContent === targetContent) return;
          const remaining = targetContent.length - displayedContent.length;
          const step = getTypewriterChunkSize(remaining);
          displayedContent += targetContent.slice(displayedContent.length, displayedContent.length + step);
          upsertAssistantMessage({ content: displayedContent, isTyping: displayedContent.length < targetContent.length });
          if (displayedContent.length < targetContent.length) {
            scheduleTypewriter();
          }
        }, AI_CHAT_TYPEWRITER_INTERVAL_MS);
      };

      const queueAssistantContent = (nextContent: string) => {
        if (!isCurrentRequest()) return;
        if (!assistantStarted) {
          assistantStarted = true;
          setStreaming(true);
          upsertAssistantMessage({ content: "", isTyping: true });
        }
        if (!nextContent.startsWith(displayedContent)) {
          displayedContent = "";
          upsertAssistantMessage({ content: "", isTyping: true });
        }
        targetContent = nextContent;
        scheduleTypewriter();
      };

      const skipTypewriter = () => {
        if (!isCurrentRequest()) return;
        if (typewriterTimer !== null) {
          window.clearTimeout(typewriterTimer);
          typewriterTimer = null;
        }
        displayedContent = targetContent;
        upsertAssistantMessage({ content: displayedContent, finalContent: targetContent || undefined, isTyping: false });
      };
      activeTypewriterControl = { skip: skipTypewriter };
      typewriterControlRef.current = activeTypewriterControl;

      const { reply, action, toolCalls } = await streamChat(
        { messages: [...memory], personality: personalityRef.current, memoryContext, references: requestReferences },
        (delta) => {
          if (!isCurrentRequest()) return;
          fullContent += delta;
          streamedPartial = fullContent;
          if (/<<ACTION_JSON>>|<<DOC_BEGIN>>|<<UPDATE_DOC:/.test(fullContent)) {
            setIsActing(true);
          }
          queueAssistantContent(sanitizeAssistantDisplayContent(fullContent, true));
        },
        () => {},
        (tc) => {
          if (!isCurrentRequest()) return;
          latestToolCalls = [...latestToolCalls.filter(t => t.index !== tc.index), tc];
          setIsActing(true);
          assistantStarted = true;
          setStreaming(true);
          upsertAssistantMessage({ content: displayedContent, isTyping: true, toolCalls: latestToolCalls });
        },
        abort.signal
      );
      if (!isCurrentRequest()) return;

      const hasAction = !!(action && (action.type === "create_document" || action.type === "update_document" || action.type === "patch_document" || action.type === "spreadsheet_patch"));
      setIsActing(hasAction);

      const finalToolCalls = toolCalls || latestToolCalls;
      const finalContent = sanitizeAssistantDisplayContent(resolveChatFinalContent({
        streamedContent: fullContent,
        finalReply: reply,
        hasToolCalls: finalToolCalls.length > 0,
      }));
      if (!finalContent.trim()) {
        throw new Error(t("ai.emptyReply"));
      }
      const actionLabels = {
        createPending: t("ai.docCreating"),
        createSuccess: t("ai.docCreatedConfirmed"),
        createFailed: t("ai.docCreateFailedDetailed"),
        updatePreview: t("ai.docUpdatePreviewReady"),
        patchPreview: t("ai.docPatchPreviewReady"),
        spreadsheetPreview: t("ai.spreadsheetPatchReady"),
        genericFailure: t("ai.menu.failed"),
        fallbackTitle: t("editor.untitled"),
      };
      const displayContent = resolveActionDisplayContent(action, finalContent, actionLabels);
      if (hasAction) {
        // Skip cosmetic typewriter delay so create/patch/update previews appear immediately.
        queueAssistantContent(displayContent);
        skipTypewriter();
        upsertAssistantMessage({
          content: displayContent,
          finalContent: displayContent,
          isTyping: false,
          toolCalls: finalToolCalls,
        });
      } else {
        // Stream already delivered the text — finalize immediately (no post-stream typewriter lag).
        queueAssistantContent(displayContent);
        skipTypewriter();
        upsertAssistantMessage({
          content: displayContent,
          finalContent: displayContent,
          isTyping: false,
          toolCalls: finalToolCalls,
        });
      }

      const replaceLastAssistantMessage = (content: string) => {
        upsertAssistantMessage({
          content,
          finalContent: content,
          isTyping: false,
          toolCalls: finalToolCalls,
        });
      };

      const saveAssistantTurn = (content: string) => {
        const assistantMemory: Message[] = [{
          role: "assistant",
          content,
          toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        }];
        for (const tc of finalToolCalls) {
          if (tc.status === "done") {
            const toolContent = buildToolMemoryContent(tc);
            if (toolContent) {
              assistantMemory.push({
                role: "tool",
                tool_call_id: normalizeChatToolCallId(tc, tc.index),
                content: toolContent,
              });
            }
          }
        }
        memoryRef.current = [...memory, ...assistantMemory];
        saveMemory(memoryScope, memoryRef.current);
      };

      const documentToolCalls = finalToolCalls.filter((tc) =>
        tc.status === "done" && (tc.name === "create_document" || tc.name === "update_document")
      );
      if (documentToolCalls.length > 0) {
        await refreshDocuments();
        if (!isCurrentRequest()) return;
        const updatedDocIds = Array.from(new Set(
          documentToolCalls
            .filter((tc) => tc.name === "update_document")
            .map((tc) => String(parseToolArguments(tc.arguments).docId || "").trim())
            .filter(Boolean)
        ));
        await Promise.all(updatedDocIds.map((docId) => loadDocument(docId)));
        if (!isCurrentRequest()) return;
      }

      // Handle create_document action — preview first, never auto-write.
      if (action?.type === "create_document") {
        const nextContent = typeof action.content === "string" ? action.content.trim() : "";
        if (!nextContent) {
          const message = resolveActionFailureContent(action, actionLabels);
          replaceLastAssistantMessage(message);
          saveAssistantTurn(message);
          toast(t("ai.menu.emptyResult"), "error");
          return;
        }
        const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : t("editor.untitled");
        setPendingCreate({
          title,
          markdown: nextContent,
          html: markdownToHtml(nextContent),
        });
        setTaskStage("preview");
        const previewMessage = t("ai.createPreviewDesc");
        replaceLastAssistantMessage(previewMessage);
        saveAssistantTurn(previewMessage);
        return;
      }

      // Handle patch_document action (local find/replace, then reuse update preview)
      if (action?.type === "patch_document") {
        try {
          const actionDocId = typeof action.docId === "string" ? action.docId.trim() : "";
          const docReferences = requestReferences.filter((ref): ref is DocumentReference => ref.type === "document");
          const fallbackDocId = docReferences.length === 1 ? docReferences[0].id : "";
          const targetDocId = actionDocId || fallbackDocId;
          const targetDoc = targetDocId ? getDocument(targetDocId) || await loadDocument(targetDocId) : null;
          if (!isCurrentRequest()) return;
          if (!targetDoc) {
            const message = t("ai.docUpdateTargetMissing");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(message, "error");
            return;
          }
          const patched = applyDocumentPatchesPreferHtml(
            targetDoc.content,
            Array.isArray(action.operations) ? action.operations : []
          );
          if (patched.applied === 0) {
            const message = t("ai.patchEmpty");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(message, "error");
            return;
          }
          const nextHtml = patched.html;
          const sourceText = htmlToPlainText(targetDoc.content);
          const diffLines = buildDiffLines(sourceText, htmlToPlainText(nextHtml));
          const stats = summarizeDiff(diffLines);
          setPendingUpdate({
            docId: targetDoc.id,
            title: targetDoc.title,
            previousTitle: targetDoc.title,
            previousHtml: targetDoc.content,
            nextMarkdown: htmlToPlainText(nextHtml),
            nextHtml,
            diffLines,
            stats,
          });
          setTaskStage("preview");
          toast(
            patched.errors.length > 0 ? t("ai.patchPartial") : t("ai.patchReady"),
            patched.errors.length > 0 ? "info" : "info"
          );
          saveAssistantTurn(displayContent);
        } catch (err: any) {
          console.error("[patch_doc] error:", err);
          const message = t("ai.patchFailed");
          replaceLastAssistantMessage(message);
          saveAssistantTurn(message);
          toast(message, "error");
        }
        return;
      }

      // Handle update_document action
      if (action?.type === "update_document") {
        try {
          const nextContent = typeof action.content === "string" ? action.content.trim() : "";
          if (!nextContent) {
            const message = t("ai.docUpdateEmpty");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(t("ai.docUpdateEmpty"), "error");
            return;
          }
          const actionDocId = typeof action.docId === "string" ? action.docId.trim() : "";
          const docReferences = requestReferences.filter((ref): ref is DocumentReference => ref.type === "document");
          const fallbackDocId = docReferences.length === 1 ? docReferences[0].id : "";
          const targetDocId = actionDocId || fallbackDocId;
          const targetDoc = targetDocId ? getDocument(targetDocId) || await loadDocument(targetDocId) : null;
          if (!isCurrentRequest()) return;
          if (!targetDoc) {
            const message = t("ai.docUpdateTargetMissing");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(message, "error");
            return;
          }
          const nextHtml = markdownToHtml(nextContent);
          const diffLines = buildDiffLines(htmlToPlainText(targetDoc.content), htmlToPlainText(nextHtml));
          const stats = summarizeDiff(diffLines);
          if (stats.added === 0 && stats.removed === 0) {
            toast(t("ai.diffNoChanges"), "info");
          }
          setPendingUpdate({
            docId: targetDoc.id,
            title: targetDoc.title,
            previousTitle: targetDoc.title,
            previousHtml: targetDoc.content,
            nextMarkdown: nextContent,
            nextHtml,
            diffLines,
            stats,
          });
          setTaskStage("preview");
          toast(t("ai.diffReady"), "info");
          saveAssistantTurn(displayContent);
        } catch (err: any) {
          console.error("[update_doc] error:", err);
          const message = t("ai.docUpdateFailed");
          replaceLastAssistantMessage(message);
          saveAssistantTurn(message);
          toast(t("ai.docUpdateFailed"), "error");
        }
        return;
      }

      // Handle spreadsheet_patch action
      if (action?.type === "spreadsheet_patch") {
        try {
          const patch = action as SpreadsheetPatchAction;
          const actionSpreadsheetId = typeof patch.spreadsheetId === "string" ? patch.spreadsheetId.trim() : "";
          const spreadsheetReferences = requestReferences.filter((ref): ref is SpreadsheetReference => ref.type === "spreadsheet");
          const fallbackSpreadsheetId = spreadsheetReferences.length === 1 ? spreadsheetReferences[0].id : currentSpreadsheetId || "";
          const targetSpreadsheetId = actionSpreadsheetId || fallbackSpreadsheetId;
          const targetSpreadsheet = targetSpreadsheetId
            ? activeSpreadsheet?.id === targetSpreadsheetId
              ? activeSpreadsheet
              : await api.getSpreadsheet(targetSpreadsheetId).then((res) => res.spreadsheet).catch(() => null)
            : null;
          if (!isCurrentRequest()) return;
          if (!targetSpreadsheet) {
            const message = t("ai.spreadsheetPatchTargetMissing");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(message, "error");
            return;
          }
          const result = applySpreadsheetPatch(targetSpreadsheet.data, patch);
          if (result.appliedCount <= 0) {
            const message = t("ai.spreadsheetPatchEmpty");
            replaceLastAssistantMessage(message);
            saveAssistantTurn(message);
            toast(message, "error");
            return;
          }
          setPendingSpreadsheetPatch({
            spreadsheetId: targetSpreadsheet.id,
            title: targetSpreadsheet.title,
            previousWorkbook: targetSpreadsheet.data,
            nextWorkbook: result.workbook,
            summary: result.summary || t("ai.spreadsheetPatchSummaryFallback").replace("{count}", String(result.appliedCount)),
            operationCount: result.appliedCount,
          });
          setTaskStage("preview");
          toast(t("ai.spreadsheetPatchReady"), "info");
          saveAssistantTurn(displayContent);
        } catch (err: any) {
          console.error("[spreadsheet_patch] error:", err);
          const message = t("ai.spreadsheetPatchFailed");
          replaceLastAssistantMessage(message);
          saveAssistantTurn(message);
          toast(message, "error");
        }
        return;
      }

      saveAssistantTurn(displayContent);
    } catch (error: any) {
      if (!isCurrentRequest()) return;
      if (error.name === "AbortError") return;
      if (error?.message === "CHAT_STREAM_INCOMPLETE" && streamedPartial.trim()) {
        const partial = sanitizeAssistantDisplayContent(
          resolveAssistantActionContent({ content: streamedPartial })
        ).trim();
        const frozen: Message = {
          role: "assistant",
          content: partial,
          finalContent: partial || undefined,
          isTyping: false,
          interrupted: true,
          timestamp: formatTimestamp(),
        };
        setMessages((prev) => {
          const next = [...prev];
          if (next[next.length - 1]?.role === "assistant") next[next.length - 1] = frozen;
          else next.push(frozen);
          return next;
        });
        memoryRef.current = [...memory, frozen];
        saveMemory(memoryScope, memoryRef.current);
        toast(t("ai.streamInterrupted"), "error");
        return;
      }
      const errorMessage = error?.message === "CHAT_STREAM_INCOMPLETE"
        || error?.name === "TypeError"
        || error?.message === "No response body"
        || /^HTTP \d+$/.test(String(error?.message || ""))
        ? t("ai.serviceUnavailable")
        : error.message || t("ai.serviceUnavailable");
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          next[next.length - 1] = { role: "assistant", content: errorMessage, timestamp: formatTimestamp() };
        } else {
          next.push({ role: "assistant", content: errorMessage, timestamp: formatTimestamp() });
        }
        return next;
      });
    } finally {
      if (typewriterTimer !== null) {
        window.clearTimeout(typewriterTimer);
      }
      if (isCurrentRequest()) {
        if (typewriterControlRef.current === activeTypewriterControl) typewriterControlRef.current = null;
        if (abortRef.current === abort) abortRef.current = null;
        setLoading(false);
        setStreaming(false);
        setIsActing(false);
        setTaskStage((stage) => (stage === "preview" ? stage : "idle"));
      }
    }
  }, [loading, streaming, currentDocumentId, currentSpreadsheetId, activeSpreadsheet, createDocument, toast, t, documents, references, brainReferences, autoBrainReferences, brainKnowledges, getDocument, loadDocument, memoryScope, refreshDocuments, updateDocument, workspaceContextEnabled]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || streaming) return;
    await doSend(text);
  }, [input, loading, streaming, doSend]);

  const finalizeInterruptedAssistant = useCallback(() => {
    typewriterControlRef.current?.skip();
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role !== "assistant") return prev;
      const content = resolveAssistantActionContent({
        content: last.content,
        finalContent: last.finalContent,
      });
      const frozen = {
        ...last,
        content,
        finalContent: content || undefined,
        isTyping: false,
        interrupted: true,
      };
      next[next.length - 1] = frozen;
      // Keep memory aligned with UI so close/save does not drop the draft.
      if (memoryRef.current.length > 0) {
        const mem = [...memoryRef.current];
        const memLast = mem[mem.length - 1];
        if (memLast?.role === "assistant") {
          mem[mem.length - 1] = {
            ...memLast,
            content: frozen.content,
            finalContent: frozen.finalContent,
            isTyping: false,
            interrupted: true,
          };
          memoryRef.current = mem;
          saveMemory(memoryScope, mem);
        } else if (frozen.content.trim()) {
          memoryRef.current = [...memoryRef.current, frozen];
          saveMemory(memoryScope, memoryRef.current);
        }
      } else if (frozen.content.trim()) {
        memoryRef.current = [frozen];
        saveMemory(memoryScope, memoryRef.current);
      }
      return next;
    });
    setLoading(false);
    setStreaming(false);
    setIsActing(false);
  }, [memoryScope]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    finalizeInterruptedAssistant();
    typewriterControlRef.current = null;
    chatViewEpochRef.current += 1;
    abortRef.current = null;
  }, [finalizeInterruptedAssistant]);

  const handleContinue = useCallback(() => {
    const lastMem = memoryRef.current[memoryRef.current.length - 1];
    const partial =
      lastMem?.role === "assistant" && lastMem.interrupted
        ? String(lastMem.finalContent || lastMem.content || "").trim()
        : "";
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant" && last.interrupted) {
        const resumed = { ...last, interrupted: false, isTyping: false };
        next[next.length - 1] = resumed;
        const mem = [...memoryRef.current];
        if (mem.length > 0 && mem[mem.length - 1]?.role === "assistant") {
          mem[mem.length - 1] = { ...mem[mem.length - 1], interrupted: false, isTyping: false };
          memoryRef.current = mem;
          saveMemory(memoryScope, mem);
        }
      }
      return next;
    });
    setTimeout(() => {
      const prompt = partial
        ? `${t("ai.continuePrompt")}\n\n${t("ai.continuePartialHint")}\n${partial.slice(-2500)}`
        : t("ai.continuePrompt");
      void doSend(prompt);
    }, 0);
  }, [doSend, memoryScope, t]);

  const handleRegenerate = useCallback(() => {
    // Abort any in-progress stream
    chatViewEpochRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    typewriterControlRef.current = null;
    setLoading(false);
    setStreaming(false);
    setIsActing(false);
    // Find the last user message, remove it and everything after, then resend
    setMessages((prev) => {
      let lastUserIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "user") {
          lastUserIdx = i;
          break;
        }
      }
      if (lastUserIdx < 0) return prev;
      const lastUserMsg = prev[lastUserIdx];
      const text = lastUserMsg.content;
      // Trim memoryRef to before the last user message (match from the end)
      let memIdx = -1;
      for (let i = memoryRef.current.length - 1; i >= 0; i--) {
        if (memoryRef.current[i].role === "user" && memoryRef.current[i].content === text) {
          memIdx = i;
          break;
        }
      }
      if (memIdx >= 0) {
        memoryRef.current = memoryRef.current.slice(0, memIdx);
      }
      // Resend via doSend (deferred so state settles first)
      setTimeout(() => { doSend(text); }, 0);
      return prev.slice(0, lastUserIdx);
    });
  }, [doSend]);

  const applyPendingCreate = useCallback(async () => {
    if (!pendingCreate || applyingCreate) return;
    const draft = pendingCreate;
    setApplyingCreate(true);
    try {
      const docId = draft.createdDocId || await createDocument("general", draft.title, draft.html, null, false);
      if (!draft.createdDocId) {
        setPendingCreate((current) => current ? { ...current, createdDocId: docId } : current);
      }
      if (draft.createdDocId) {
        await updateDocument(docId, { title: draft.title, content: draft.html });
      }
      const verifiedDoc = await loadDocument(docId);
      if (!verifiedDoc || verifiedDoc.title !== draft.title || verifiedDoc.content !== draft.html) {
        setPendingCreate((current) => current ? { ...current, createdDocId: docId } : current);
        toast(t("ai.docCreateVerifyFailed"), "error");
        return;
      }
      setPendingCreate(null);
      setTaskStage("done");
      toast(t("ai.docCreated"), "success");
      await refreshDocuments().catch(() => {});
    } catch {
      toast(t("ai.docCreateFailed"), "error");
    } finally {
      setApplyingCreate(false);
      setTimeout(() => setTaskStage("idle"), 1200);
    }
  }, [applyingCreate, createDocument, loadDocument, pendingCreate, refreshDocuments, t, toast, updateDocument]);

  const applyPendingUpdate = useCallback(async () => {
    if (!pendingUpdate || applyingUpdate) return;
    const update = pendingUpdate; // 缓存当前值，避免中途关闭弹窗后被清空
    setApplyingUpdate(true);
    let snapshot: DocumentVersion | undefined;
    let writeAttempted = false;

    const rollbackToSnapshot = async () => {
      if (!snapshot) throw new Error("Missing AI edit snapshot");
      cancelPendingDocumentAutosave(update.docId);
      const restored = await restoreDocumentVersion(update.docId, snapshot.id);
      if (!restored || restored.content !== snapshot.content) {
        throw new Error("AI edit rollback verification failed");
      }
      notifyDocumentExternalWrite(update.docId, restored.content);
    };

    try {
      const flushed = await requestDocumentAutosaveFlush(update.docId);
      if (!flushed) {
        toast(t("ai.docFlushFailed"), "error");
        return;
      }
      const currentDoc = await loadDocument(update.docId);
      if (!isDocumentActionBaselineCurrent(currentDoc, {
        title: update.previousTitle,
        content: update.previousHtml,
      })) {
        setPendingUpdate(null);
        toast(t("ai.docUpdateStale"), "error");
        return;
      }
      try {
        setTaskStage("snapshot");
        cancelPendingDocumentAutosave(update.docId);
        snapshot = await createDocumentVersion(update.docId, "ai_edit");
        if (!snapshot) throw new Error("AI edit snapshot was not created");
      } catch (err) {
        console.error("[version_snapshot] error:", err);
        toast(t("ai.versionSnapshotFailed"), "error");
        return;
      }

      cancelPendingDocumentAutosave(update.docId);
      writeAttempted = true;
      await updateDocument(update.docId, {
        title: update.title,
        content: update.nextHtml,
      });
      notifyDocumentExternalWrite(update.docId, update.nextHtml);
      setTaskStage("verify");
      const verifiedDoc = await loadDocument(update.docId);
      if (!verifiedDoc || verifiedDoc.content !== update.nextHtml) {
        await rollbackToSnapshot();
        toast(t("ai.docUpdateRolledBack"), "error");
        return;
      }

      toast(t("ai.docUpdated"), "success");
      setPendingUpdate(null);
      setTaskStage("done");
    } catch (err: any) {
      console.error("[apply_update] error:", err);
      if (snapshot && writeAttempted) {
        try {
          await rollbackToSnapshot();
          toast(t("ai.docUpdateRolledBack"), "error");
        } catch (rollbackError) {
          console.error("[apply_update_rollback] error:", rollbackError);
          toast(t("ai.docUpdateRollbackFailed"), "error");
        }
      } else {
        toast(t("ai.docUpdateFailed"), "error");
      }
    } finally {
      setApplyingUpdate(false);
      setTimeout(() => setTaskStage("idle"), 1200);
    }
  }, [applyingUpdate, createDocumentVersion, loadDocument, pendingUpdate, restoreDocumentVersion, t, toast, updateDocument]);

  const applyPendingSpreadsheetPatch = useCallback(async () => {
    if (!pendingSpreadsheetPatch || applyingSpreadsheetPatch) return;
    const patch = pendingSpreadsheetPatch;
    setApplyingSpreadsheetPatch(true);
    let writeAttempted = false;

    const publishSpreadsheetState = (spreadsheet: Spreadsheet) => {
      setActiveSpreadsheet(spreadsheet);
      window.dispatchEvent(new CustomEvent("spreadsheet:updated", {
        detail: { id: patch.spreadsheetId, spreadsheet },
      }));
    };

    const rollbackSpreadsheet = async () => {
      await api.updateSpreadsheet(patch.spreadsheetId, {
        title: patch.title,
        data: patch.previousWorkbook,
      });
      const restored = await api.getSpreadsheet(patch.spreadsheetId);
      if (JSON.stringify(restored.spreadsheet.data) !== JSON.stringify(patch.previousWorkbook)) {
        throw new Error("AI spreadsheet rollback verification failed");
      }
      publishSpreadsheetState(restored.spreadsheet);
    };

    try {
      const current = await api.getSpreadsheet(patch.spreadsheetId);
      if (!isSpreadsheetActionBaselineCurrent(current.spreadsheet, {
        title: patch.title,
        data: patch.previousWorkbook,
      })) {
        setPendingSpreadsheetPatch(null);
        toast(t("ai.spreadsheetPatchStale"), "error");
        return;
      }
      writeAttempted = true;
      await api.updateSpreadsheet(patch.spreadsheetId, {
        title: patch.title,
        data: patch.nextWorkbook,
      });
      setTaskStage("verify");
      const verified = await api.getSpreadsheet(patch.spreadsheetId);
      if (JSON.stringify(verified.spreadsheet.data) !== JSON.stringify(patch.nextWorkbook)) {
        throw new Error("AI spreadsheet update verification failed");
      }
      publishSpreadsheetState(verified.spreadsheet);
      setSpreadsheetUndo({
        spreadsheetId: patch.spreadsheetId,
        title: patch.title,
        workbook: patch.previousWorkbook,
        expectedCurrentTitle: verified.spreadsheet.title,
        expectedCurrentWorkbook: verified.spreadsheet.data,
      });
      toast(t("ai.spreadsheetPatchApplied"), "success");
      setPendingSpreadsheetPatch(null);
      setTaskStage("done");
    } catch (err) {
      console.error("[apply_spreadsheet_patch] error:", err);
      if (writeAttempted) {
        try {
          await rollbackSpreadsheet();
          toast(t("ai.spreadsheetPatchRolledBack"), "error");
        } catch (rollbackError) {
          console.error("[apply_spreadsheet_patch_rollback] error:", rollbackError);
          toast(t("ai.spreadsheetPatchRollbackFailed"), "error");
        }
      } else {
        toast(t("ai.spreadsheetPatchFailed"), "error");
      }
    } finally {
      setApplyingSpreadsheetPatch(false);
      setTimeout(() => setTaskStage("idle"), 1200);
    }
  }, [applyingSpreadsheetPatch, pendingSpreadsheetPatch, t, toast]);

  const undoSpreadsheetPatch = useCallback(async () => {
    if (!spreadsheetUndo || applyingSpreadsheetPatch) return;
    setApplyingSpreadsheetPatch(true);
    try {
      const current = await api.getSpreadsheet(spreadsheetUndo.spreadsheetId);
      if (!isSpreadsheetActionBaselineCurrent(current.spreadsheet, {
        title: spreadsheetUndo.expectedCurrentTitle,
        data: spreadsheetUndo.expectedCurrentWorkbook,
      })) {
        setSpreadsheetUndo(null);
        toast(t("ai.spreadsheetUndoStale"), "error");
        return;
      }
      await api.updateSpreadsheet(spreadsheetUndo.spreadsheetId, {
        title: spreadsheetUndo.title,
        data: spreadsheetUndo.workbook,
      });
      const verified = await api.getSpreadsheet(spreadsheetUndo.spreadsheetId);
      if (JSON.stringify(verified.spreadsheet.data) !== JSON.stringify(spreadsheetUndo.workbook)) {
        throw new Error("Spreadsheet undo verification failed");
      }
      setActiveSpreadsheet(verified.spreadsheet);
      window.dispatchEvent(new CustomEvent("spreadsheet:updated", {
        detail: { id: spreadsheetUndo.spreadsheetId, spreadsheet: verified.spreadsheet },
      }));
      setSpreadsheetUndo(null);
      toast(t("ai.spreadsheetUndone"), "success");
    } catch (err) {
      console.error("[undo_spreadsheet_patch] error:", err);
      toast(t("ai.spreadsheetUndoFailed"), "error");
    } finally {
      setApplyingSpreadsheetPatch(false);
    }
  }, [applyingSpreadsheetPatch, spreadsheetUndo, t, toast]);

  const loadVersions = useCallback(async () => {
    if (!currentDocumentId) {
      setVersions([]);
      return;
    }
    setVersionLoading(true);
    try {
      const nextVersions = await listDocumentVersions(currentDocumentId);
      setVersions(nextVersions);
    } catch (err) {
      console.error("[versions] load error:", err);
      toast(t("ai.versionLoadFailed"), "error");
    } finally {
      setVersionLoading(false);
    }
  }, [currentDocumentId, listDocumentVersions, t, toast]);

  useEffect(() => {
    if (versionDialogOpen) {
      loadVersions();
    }
  }, [loadVersions, versionDialogOpen]);

  const restoreVersion = useCallback(async (version: DocumentVersion) => {
    if (!currentDocumentId || restoringVersionId) return;
    setRestoringVersionId(version.id);
    try {
      const flushed = await requestDocumentAutosaveFlush(currentDocumentId);
      if (!flushed) {
        toast(t("ai.docFlushFailed"), "error");
        return;
      }
      cancelPendingDocumentAutosave(currentDocumentId);
      await restoreDocumentVersion(currentDocumentId, version.id);
      const restored = await loadDocument(currentDocumentId);
      if (!restored || restored.title !== version.title || restored.content !== version.content) {
        throw new Error("Version restore verification failed");
      }
      notifyDocumentExternalWrite(currentDocumentId, restored.content);
      toast(t("ai.versionRestored"), "success");
      await loadVersions();
    } catch (err) {
      console.error("[versions] restore error:", err);
      toast(t("ai.versionRestoreFailed"), "error");
    } finally {
      setRestoringVersionId(null);
    }
  }, [currentDocumentId, loadDocument, loadVersions, restoreDocumentVersion, restoringVersionId, t, toast]);


  const currentPersonality = PERSONALITY_OPTIONS.find((p) => p.key === personality) || PERSONALITY_OPTIONS[0];
  const isGenerating = loading || streaming;
  const mention = getMentionQuery(input);
  const brainMention = getBrainQuery(input);
  const slash = getSlashQuery(input);
  const slashCommands: SlashCommand[] = [
    { id: "write", label: t("agent.open"), prompt: t("agent.subtitle") },
    { id: "rewrite", label: t("ai.commandRewrite"), prompt: t("ai.commandRewritePrompt") },
    { id: "summarize", label: t("ai.commandSummarize"), prompt: t("ai.commandSummarizePrompt") },
    { id: "expand", label: t("ai.commandExpand"), prompt: t("ai.commandExpandPrompt") },
    { id: "formal", label: t("ai.commandFormal"), prompt: t("ai.commandFormalPrompt") },
    { id: "outline", label: t("ai.commandOutline"), prompt: t("ai.commandOutlinePrompt") },
    { id: "docqa", label: t("ai.commandDocQA"), prompt: t("ai.commandDocQAPrompt") },
    { id: "multisummary", label: t("ai.commandMultiSummary"), prompt: t("ai.commandMultiSummaryPrompt") },
  ];
  const commandMatches = slash
    ? slashCommands.filter((command) => (
        command.label.toLowerCase().includes(slash.query.toLowerCase()) ||
        command.id.toLowerCase().includes(slash.query.toLowerCase())
      ))
    : [];
  const mentionMatches = mention
    ? documents
        .filter((doc) => !references.some((ref) => ref.id === doc.id))
        .filter((doc) => doc.title.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];
  const brainMatches = brainMention
    ? brainKnowledges
        .filter((item) => !brainReferences.some((ref) => ref.id === item.id))
        .filter((item) => item.title.toLowerCase().includes(brainMention.query.toLowerCase()))
        .slice(0, 6)
    : [];
  const showMentionMenu = mentionOpen && !!mention && !isGenerating;
  const showBrainMenu = brainOpen && !!brainMention && !isGenerating;
  const showCommandMenu = commandOpen && !!slash && !isGenerating;
  const activeContextDocument = currentDocumentId ? getDocument(currentDocumentId) : undefined;
  const activeContextSpreadsheet = currentSpreadsheetId && activeSpreadsheet?.id === currentSpreadsheetId ? activeSpreadsheet : null;
  const taskStageLabel = (stage: TaskStage) => {
    if (stage === "analyzing") return t("ai.taskAnalyze");
    if (stage === "generating") return t("ai.taskGenerate");
    if (stage === "preview") return t("ai.taskPreview");
    if (stage === "snapshot") return t("ai.taskSnapshot");
    if (stage === "verify") return t("ai.taskVerify");
    if (stage === "done") return t("ai.taskDone");
    return "";
  };
  const taskSteps: { stage: TaskStage; label: string }[] = [
    { stage: "analyzing", label: t("ai.taskAnalyze") },
    { stage: "generating", label: t("ai.taskGenerate") },
    { stage: "preview", label: t("ai.taskPreview") },
    { stage: "snapshot", label: t("ai.taskSnapshot") },
    { stage: "verify", label: t("ai.taskVerify") },
  ];
  const activeTaskIndex = taskSteps.findIndex((step) => step.stage === taskStage);
  const versionSourceLabel = (source: string) => {
    if (source === "ai_edit") return t("ai.versionBeforeAi");
    if (source === "restore") return t("ai.versionBeforeRestore");
    return t("ai.versionManual");
  };

  const selectReference = (doc: { id: string; title: string }) => {
    if (!mention) return;
    setReferences((prev) => (
      prev.some((ref) => ref.id === doc.id)
        ? prev
        : [...prev, { type: "document", id: doc.id, title: doc.title }]
    ));
    setInput((prev) => `${prev.slice(0, mention.start)}@${doc.title} `);
    setMentionOpen(false);
  };

  const removeReference = (ref: DocumentReference) => {
    setReferences((prev) => prev.filter((item) => item.id !== ref.id));
    const tokenPattern = new RegExp(`(^|\\s)@${escapeRegExp(ref.title)}(?=\\s|$)`, "g");
    setInput((prev) => prev.replace(tokenPattern, " ").replace(/\s{2,}/g, " ").trimStart());
  };

  const selectBrainReference = (item: BrainKnowledge) => {
    if (!brainMention) return;
    setBrainReferences((prev) => (
      prev.some((ref) => ref.id === item.id)
        ? prev
        : [...prev, { type: "brain", id: item.id, title: item.title }]
    ));
    setInput((prev) => `${prev.slice(0, brainMention.start)}#${item.title} `);
    setBrainOpen(false);
  };

  const removeBrainReference = (ref: BrainReference) => {
    setBrainReferences((prev) => prev.filter((item) => item.id !== ref.id));
    const tokenPattern = new RegExp(`(^|\\s)#${escapeRegExp(ref.title)}(?=\\s|$)`, "g");
    setInput((prev) => prev.replace(tokenPattern, " ").replace(/\s{2,}/g, " ").trimStart());
  };

  const removeAutoBrainReference = (ref: BrainReference) => {
    setAutoBrainReferences((prev) => prev.filter((item) => item.id !== ref.id));
  };

  const toggleAutoReference = () => {
    setAutoReferenceEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(AUTO_RAG_KEY, next ? "1" : "0");
      if (!next) setAutoBrainReferences([]);
      return next;
    });
  };

  const selectCommand = (command: SlashCommand) => {
    if (!slash) return;
    if (command.id === "write") {
      // Extract goal text after "/write " from the input (if user typed it inline)
      const afterSlash = slash ? input.slice(slash.start) : "";
      const goalText = afterSlash.replace(/^\/write\s*/, "").trim();
      window.dispatchEvent(new CustomEvent("znwriter-agent-write-open", { detail: { goal: goalText || undefined } }));
      setInput((prev) => prev.slice(0, slash.start).trimStart());
      setCommandOpen(false);
      setCommandIndex(0);
      return;
    }
    setInput((prev) => `${prev.slice(0, slash.start)}${command.prompt}`);
    setCommandOpen(false);
    setCommandIndex(0);
    window.setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  const handleInputChange = (next: string) => {
    const nextInput = next.slice(0, MAX_CHAT_INPUT_CHARS);
    setInput(nextInput);
    const nextMention = getMentionQuery(nextInput);
    const nextBrain = getBrainQuery(nextInput);
    const nextSlash = getSlashQuery(nextInput);
    setMentionOpen(!!nextMention);
    setBrainOpen(!!nextBrain && !nextMention);
    setCommandOpen(!!nextSlash && !nextMention && !nextBrain);
    setMentionIndex(0);
    setBrainIndex(0);
    setCommandIndex(0);
    setReferences((prev) => prev.filter((ref) => textMentionsTitle(nextInput, ref.title, "@")));
    setBrainReferences((prev) => prev.filter((ref) => textMentionsTitle(nextInput, ref.title, "#")));
  };

  const closeWithAnimation = useCallback(() => {
    if (pendingUpdate || pendingCreate || pendingSpreadsheetPatch) {
      setConfirmClosePending(true);
      return;
    }
    if (loading || streaming) {
      finalizeInterruptedAssistant();
      typewriterControlRef.current = null;
      abortRef.current?.abort();
    } else if (abortRef.current) {
      abortRef.current.abort();
    }
    window.setTimeout(() => {
      void saveConversation();
    }, 0);

    const panel = chatPanelRef.current;
    if (!panel) {
      setOpen(false);
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setOpen(false);
      return;
    }

    const enterItems = panel.querySelectorAll("[data-ai-chat-enter]");
    gsap.timeline({
      defaults: { ease: "power3.in" },
      onComplete: () => setOpen(false),
    })
      .to(
        enterItems,
        { autoAlpha: 0, y: 8, duration: 0.22, stagger: 0.03, ease: "power2.in" },
        0
      )
      .to(
        panel,
        { autoAlpha: 0, scale: 0.92, y: 18, filter: "blur(10px)", duration: 0.32 },
        0.06
      );
  }, [finalizeInterruptedAssistant, loading, pendingCreate, pendingSpreadsheetPatch, pendingUpdate, saveConversation, streaming]);

  // Keep index refs in sync for keyboard handler (avoids stale closure issues)
  mentionIdxRef.current = mentionIndex;
  brainIdxRef.current = brainIndex;
  commandIdxRef.current = commandIndex;

  // Unified keyboard handler: autocomplete nav + input history + Escape
  const handleChatKeyDown = useCallback((e: React.KeyboardEvent) => {
    const activeEl = document.activeElement;
    if (!activeEl || !(activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement)) return;
    if (!activeEl.closest("[data-ai-chat-panel]")) return;
    if (e.nativeEvent.isComposing) return;

    // Escape: dismiss menus, then close panel
    if (e.key === "Escape") {
      if (commandOpen) { e.preventDefault(); setCommandOpen(false); return; }
      if (brainOpen) { e.preventDefault(); setBrainOpen(false); return; }
      if (mentionOpen) { e.preventDefault(); setMentionOpen(false); return; }
      e.preventDefault();
      closeWithAnimation();
      return;
    }

    // Enter: select highlighted autocomplete item (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      if (commandOpen && commandMatches.length > 0) {
        e.preventDefault();
        selectCommand(commandMatches[commandIdxRef.current]);
        return;
      }
      if (brainOpen && brainMatches.length > 0) {
        e.preventDefault();
        selectBrainReference(brainMatches[brainIdxRef.current]);
        return;
      }
      if (mentionOpen && mentionMatches.length > 0) {
        e.preventDefault();
        selectReference(mentionMatches[mentionIdxRef.current]);
        return;
      }
      e.preventDefault();
      void handleSend();
      return;
    }

    // Arrow keys: autocomplete navigation
    if (commandOpen && commandMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCommandIndex(p => (p + 1) % commandMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setCommandIndex(p => (p - 1 + commandMatches.length) % commandMatches.length); return; }
      return;
    }
    if (brainOpen && brainMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setBrainIndex(p => (p + 1) % brainMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setBrainIndex(p => (p - 1 + brainMatches.length) % brainMatches.length); return; }
      return;
    }
    if (mentionOpen && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(p => (p + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex(p => (p - 1 + mentionMatches.length) % mentionMatches.length); return; }
      return;
    }

    // Arrow keys: input history (only when no autocomplete is open)
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const history = sentHistoryRef.current;
      if (history.length === 0) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          draftBeforeHistoryRef.current = (activeEl as HTMLTextAreaElement).value;
          historyIndexRef.current = 0;
        } else if (historyIndexRef.current < history.length - 1) {
          historyIndexRef.current++;
        }
        setInput(history[historyIndexRef.current]);
      } else {
        e.preventDefault();
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
          setInput(history[historyIndexRef.current]);
        } else if (historyIndexRef.current === 0) {
          historyIndexRef.current = -1;
          setInput(draftBeforeHistoryRef.current);
        }
      }
    }
  }, [
    mentionOpen, brainOpen, commandOpen,
    mentionMatches, brainMatches, commandMatches,
    selectReference, selectBrainReference, selectCommand,
    closeWithAnimation, handleSend,
  ]);

  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!open || !keyOk || !panel) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => {
      const rect = panel.getBoundingClientRect();
      const originX = Math.min(Math.max(pos.x + 31 - rect.left, 24), rect.width - 24);
      const originY = Math.min(Math.max(pos.y + 31 - rect.top, 24), rect.height - 24);
      const enterItems = panel.querySelectorAll("[data-ai-chat-enter]");

      gsap.set(panel, { transformOrigin: `${originX}px ${originY}px` });

      if (reduceMotion) {
        gsap.set(panel, { autoAlpha: 1, scale: 1, y: 0, filter: "none" });
        gsap.set(enterItems, { autoAlpha: 1, y: 0 });
        return;
      }

      const timeline = gsap.timeline({ defaults: { ease: "power3.out" } });
      timeline
        .fromTo(
          panel,
          { autoAlpha: 0, scale: 0.92, y: 18, filter: "blur(10px)" },
          { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", duration: 0.42, clearProps: "filter,transform,opacity,visibility" }
        )
        .fromTo(
          enterItems,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out", stagger: 0.055, clearProps: "transform,opacity,visibility" },
          0.08
        );
    }, panel);

    return () => ctx.revert();
  }, [keyOk, open, pos.x, pos.y]);

  const chatHeaderButtonClass =
    "h-8 w-8 rounded-lg border border-transparent text-surface-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm focus-visible:ring-brand-300 dark:text-surface-400 dark:hover:border-brand-700/60 dark:hover:bg-brand-950/60 dark:hover:text-brand-200";
  const chatHeaderDangerButtonClass =
    "h-8 w-8 rounded-lg border border-transparent text-surface-500 transition-all duration-200 hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-600 hover:shadow-sm focus-visible:ring-red-300 dark:text-surface-400 dark:hover:border-red-800/70 dark:hover:bg-red-950/50 dark:hover:text-red-300";
  const chatHeaderActiveButtonClass =
    "border-brand-200 bg-brand-100 text-brand-700 shadow-sm dark:border-brand-700/70 dark:bg-brand-950/70 dark:text-brand-300";

  return (
    <>
      {/* Floating button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onPointerDown={handlePointerDown}
        aria-label={t("ai.title")}
        className={cn(
          "group fixed z-50 flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(232,237,233,0.92))] shadow-[0_18px_38px_rgba(46,61,57,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] ring-1 ring-surface-200/70 transition-all duration-300 select-none backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(47,55,52,0.96),rgba(24,32,30,0.92))] dark:ring-white/10 touch-none",
          open ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100",
          dragging ? "cursor-grabbing scale-105" : "cursor-grab hover:-translate-y-0.5 hover:scale-105",
          "text-surface-700 dark:text-surface-100"
        )}
        style={{ left: pos.x, top: pos.y, transition: dragging ? "none" : undefined }}
      >
        <span className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_33%_22%,rgba(255,255,255,0.88),rgba(255,255,255,0)_34%),linear-gradient(145deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08)_58%,rgba(185,149,78,0.14))] shadow-[inset_0_-10px_18px_rgba(92,107,102,0.08)] dark:bg-[radial-gradient(circle_at_35%_22%,rgba(255,255,255,0.22),rgba(255,255,255,0)_32%),linear-gradient(145deg,rgba(255,255,255,0.12),rgba(185,149,78,0.12))]" />
        <span className="absolute -right-4 -top-4 h-11 w-11 rounded-full bg-brand-200/35 blur-xl transition-transform duration-500 group-hover:translate-x-1 group-hover:translate-y-1 dark:bg-brand-500/20" />
        <img
          src={catAvatar}
          alt={t("ai.title")}
          draggable={false}
          className="relative h-12 w-12 rounded-full object-cover pointer-events-none select-none"
        />
      </Button>

      {open && !keyOk && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("ai.title")}
          className={cn(
            "fixed bottom-6 z-50 w-[min(420px,calc(100vw-48px))] overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900",
            "right-6 max-sm:inset-x-2 max-sm:bottom-2 max-sm:w-auto"
          )}
        >
          <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <div className="flex items-center gap-2">
              <img src={catAvatar} alt={t("ai.title")} className="h-8 w-8 rounded-full object-cover" />
              <span className="text-sm font-semibold text-surface-900 dark:text-surface-100">{t("ai.title")}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.close")}
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="p-5">
            {readinessStatus === "checking" ? (
              <div className="flex min-h-32 items-center justify-center">
                <InlineLoading variant="ai" label={t("ai.readinessChecking")} />
              </div>
            ) : (
              <>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="text-base font-semibold text-surface-950 dark:text-surface-50">
                  {t(readinessStatus === "missing" ? "ai.configRequiredTitle" : "ai.configCheckFailedTitle")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-surface-500 dark:text-surface-400">
                  {t(readinessStatus === "missing" ? "ai.configRequiredDesc" : "ai.configCheckFailedDesc")}
                </p>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {readinessStatus === "unavailable" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReadinessStatus("checking");
                        resolveAiReadiness(() => api.getApiKey()).then((status) => {
                          setReadinessStatus(status);
                          setKeyOk(status === "ready");
                        });
                      }}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t("ai.retryConfigCheck")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAiModelConfig();
                    }}
                  >
                    {t("ai.openModelConfig")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {open && keyOk && (
        <div
          ref={chatPanelRef}
          data-ai-chat-panel
          role="dialog"
          aria-modal="true"
          aria-label={t("ai.title")}
          onKeyDownCapture={handleChatKeyDown}
          className={cn(
            "fixed z-50 flex flex-col rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900",
            "bottom-6 h-[min(760px,calc(100vh-48px))] w-[min(560px,calc(100vw-48px))]",
            "right-6 max-sm:inset-x-2 max-sm:bottom-2 max-sm:left-2 max-sm:right-2 max-sm:h-[calc(100dvh-1rem)] max-sm:w-auto max-sm:rounded-xl"
          )}
        >
          {/* Backdrop: while streaming, do not abort — ask user to stop first */}
          <Button
            type="button"
            variant="ghost"
            aria-label={t("common.close")}
            className="fixed inset-0 -z-10 h-auto w-auto rounded-none p-0"
            onClick={() => {
              closeWithAnimation();
            }}
          />
          {/* Header */}
          <div data-ai-chat-enter className="shrink-0 border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 overflow-hidden">
                  <img src={catAvatar} alt={t("ai.title")} className="h-8 w-8 object-cover" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{t("ai.title")}</h3>
                  <p className="text-[10px] text-surface-500">{t("ai.title")} · {t(currentPersonality.labelKey)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content={t("ai.newChat")} delay={150}>
                  <Button aria-label={t("ai.newChat")} variant="ghost" size="icon" disabled={isGenerating} onClick={() => { void startNewChat(); }} className={chatHeaderButtonClass}>
                    <MessageSquarePlus className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <AIChatSessionsMenu
                  open={sessionsOpen}
                  sessions={sessions}
                  activeConversationId={conversationId}
                  buttonClassName={chatHeaderButtonClass}
                  activeButtonClassName={chatHeaderActiveButtonClass}
                  disabled={isGenerating}
                  labels={{
                    sessions: t("ai.sessions"),
                    sessionsEmpty: t("ai.sessionsEmpty"),
                    deleteAria: t("ai.deleteSession"),
                  }}
                  onToggle={() => setSessionsOpen((prev) => !prev)}
                  onClose={() => setSessionsOpen(false)}
                  onSwitch={(id) => { void switchConversation(id); }}
                  onDelete={(id) => { void deleteSession(id); }}
                />
                {currentDocumentId && (
                  <Tooltip content={t("ai.versionHistory")} delay={150}>
                    <Button aria-label={t("ai.versionHistory")} variant="ghost" size="icon" onClick={() => setVersionDialogOpen(true)} className={chatHeaderButtonClass}>
                      <History className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip content={t("card.edit")} delay={150}>
                  <Button
                    aria-label={t("card.edit")}
                    variant="ghost"
                    size="icon"
                    disabled={isGenerating}
                    onClick={() => { setEditMode(!editMode); setSelectedMsgs(new Set()); }}
                    className={cn(chatHeaderButtonClass, editMode && chatHeaderActiveButtonClass)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content={t("ai.clearHistory")} delay={150}>
                  <Button
                    aria-label={t("ai.clearHistory")}
                    variant="ghost"
                    size="icon"
                    disabled={isGenerating}
                    onClick={() => {
                      if (pendingUpdate || pendingCreate || pendingSpreadsheetPatch) {
                        toast(t("ai.finishPreviewFirst"), "info");
                        return;
                      }
                      setDeleteConfirm(true);
                    }}
                    className={chatHeaderDangerButtonClass}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content={t("common.close")} delay={150}>
                  <Button aria-label={t("common.close")} variant="ghost" size="icon" onClick={closeWithAnimation} className={chatHeaderDangerButtonClass}>
                    <X className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Personality selector */}
            <div className="flex items-center gap-2">
            <DropdownMenu open={personalityOpen} onOpenChange={setPersonalityOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isGenerating}
                  aria-label={t("ai.personalitySelector")}
                  aria-expanded={personalityOpen}
                  className="h-7 gap-1.5 bg-surface-50 px-2 text-xs font-normal text-surface-600 dark:bg-surface-800 dark:text-surface-400"
                >
                  <Smile className="h-3 w-3" />
                  <span>{currentPersonality.emoji} {t(currentPersonality.labelKey)}</span>
                  <ChevronDown className={cn("h-3 w-3 transition-transform", personalityOpen && "rotate-180")} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-36">
                {PERSONALITY_OPTIONS.map((opt, index) => (
                  <DropdownMenuItem
                    key={opt.key}
                    index={index}
                    onSelect={() => changePersonality(opt.key)}
                    className={cn(
                      "text-xs",
                      personality === opt.key && "bg-brand-50 font-medium text-brand-600 dark:bg-brand-950 dark:text-brand-400"
                    )}
                  >
                    <span>{opt.emoji}</span>
                    <span>{t(opt.labelKey)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {activeContextDocument && (
              <Toggle
                pressed={workspaceContextEnabled}
                onPressedChange={(pressed) => {
                  setWorkspaceContextEnabled(pressed);
                  localStorage.setItem(WORKSPACE_CONTEXT_KEY, pressed ? "1" : "0");
                }}
                aria-label={t("ai.toggleCurrentContext")}
                className={cn(
                  "flex h-auto min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                  workspaceContextEnabled
                    ? "border-brand-100 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300"
                    : "border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400"
                )}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="shrink-0 font-medium">{t("ai.currentContext")}</span>
                <span className="truncate">@{activeContextDocument.title}</span>
                <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-900/70 dark:text-brand-200">
                  {t(workspaceContextEnabled ? "ai.contextOnDemand" : "ai.contextDisabled")}
                </span>
              </Toggle>
            )}
            {activeContextSpreadsheet && (
              <Toggle
                pressed={workspaceContextEnabled}
                onPressedChange={(pressed) => {
                  setWorkspaceContextEnabled(pressed);
                  localStorage.setItem(WORKSPACE_CONTEXT_KEY, pressed ? "1" : "0");
                }}
                aria-label={t("ai.toggleCurrentContext")}
                className={cn(
                  "flex h-auto min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-xs",
                  workspaceContextEnabled
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400"
                )}
              >
                <FileSpreadsheet className="h-3 w-3 shrink-0" />
                <span className="shrink-0 font-medium">{t("ai.spreadsheetContext")}</span>
                <span className="truncate">{activeContextSpreadsheet.title}</span>
                <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:bg-emerald-900/70 dark:text-emerald-200">
                  {t(workspaceContextEnabled ? "ai.contextOnDemand" : "ai.contextDisabled")}
                </span>
              </Toggle>
            )}
            </div>
            {taskStage !== "idle" && (
              <div className="mt-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">
                    {t("ai.taskMode")}
                  </span>
                  <span className="text-[10px] font-medium text-brand-600 dark:text-brand-300">
                    {taskStage === "preview" ? t("ai.taskWaiting") : taskStageLabel(taskStage)}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {taskSteps.map((step, index) => {
                    const done = taskStage === "done" || (activeTaskIndex !== -1 && index < activeTaskIndex);
                    const active = step.stage === taskStage;
                    return (
                      <div
                        key={step.stage}
                        className={cn(
                          "h-1.5 rounded-full transition-colors",
                          done && "bg-brand-500",
                          active && "bg-brand-300 dark:bg-brand-500",
                          !done && !active && "bg-surface-200 dark:bg-surface-700"
                        )}
                        title={step.label}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Messages */}
          <Scrollbar
            ref={messagesScrollbarRef}
            data-ai-chat-enter
            className="flex-1 px-4 py-4"
            options={{ scrollbars: { autoHide: "leave" } }}
            events={{
              initialized: () => {
                if (open && keyOk && messages.length > 0) scheduleChatScrollToBottom();
              },
              updated: () => {
                if (forceLatestOnOpenRef.current) scheduleChatScrollToBottom();
              },
              scroll: handleScrollEvent,
            }}
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
                  <Sparkles className="h-6 w-6 text-brand-500" />
                </div>
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300">{t("ai.greeting")}</p>
                <p className="mt-1 text-xs text-surface-500">{t("ai.greetingDesc")}</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const isLastAssistant = !isUser && i === messages.length - 1;
                  const assistantActionContent = isUser
                    ? ""
                    : resolveAssistantActionContent({ content: msg.content, finalContent: msg.finalContent });
                  const canFeedback = !isUser && canSendAssistantFeedback({
                    content: msg.content,
                    finalContent: msg.finalContent,
                    isTyping: msg.isTyping,
                    interrupted: msg.interrupted,
                  });
                  return (
                    <div key={i} className={cn("mb-4 flex gap-2 items-start", isUser ? "flex-row-reverse" : "flex-row")}>
                      {/* Edit checkbox */}
                      {editMode && (
                        <Toggle
                          pressed={selectedMsgs.has(i)}
                          aria-label={t("ai.selectMessage")}
                          onPressedChange={() => {
                            const next = new Set(selectedMsgs);
                            next.has(i) ? next.delete(i) : next.add(i);
                            setSelectedMsgs(next);
                          }}
                          className={cn(
                            "shrink-0 mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            selectedMsgs.has(i)
                              ? "bg-brand-500 border-brand-500 text-white"
                              : "border-surface-300 hover:border-brand-400 dark:border-surface-600"
                          )}
                        >
                          {selectedMsgs.has(i) && <Check className="h-3 w-3" />}
                        </Toggle>
                      )}
                      {/* Avatar */}
                      {isUser ? (
                        avatarUrl ? (
                          <img src={avatarUrl} alt={user?.name || t("ai.userAvatar")} className="h-7 w-7 shrink-0 rounded-full object-cover mt-0.5" />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white mt-0.5">
                            {initials}
                          </div>
                        )
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 mt-0.5 overflow-hidden">
                          <img src={catAvatar} alt={t("ai.title")} className="h-7 w-7 object-cover" />
                        </div>
                      )}

                      {/* Message bubble */}
                      <div className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed relative",
                        isUser
                          ? "bg-brand-500 text-white rounded-br-md whitespace-pre-wrap"
                          : "bg-surface-100 text-surface-800 rounded-bl-md dark:bg-surface-800 dark:text-surface-200 group"
                      )}>
                        {isUser ? (
                          msg.content
                        ) : (
                          <>
                            {/* Tool call timeline */}
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              (() => {
                                const hasRunningTool = msg.toolCalls.some((tc) => tc.status === "calling");
                                const doneCount = msg.toolCalls.filter((tc) => tc.status === "done").length;
                                const toolLabels: Record<string, string> = {
                                  search_web: t("ai.searchWeb"),
                                  create_document: t("ai.createDoc"),
                                  update_document: t("ai.updateDoc"),
                                  get_user_stats: t("ai.tool.getUserStats"),
                                  get_today_writing: t("ai.tool.getTodayWriting"),
                                  list_documents: t("ai.tool.listDocuments"),
                                  get_document_summary: t("ai.tool.getDocumentSummary"),
                                  search_documents: t("ai.tool.searchDocuments"),
                                  list_spreadsheets: t("ai.tool.listSpreadsheets"),
                                  get_spreadsheet_summary: t("ai.tool.getSpreadsheetSummary"),
                                  search_spreadsheets: t("ai.tool.searchSpreadsheets"),
                                  list_recent_documents: t("ai.tool.listRecentDocuments"),
                                  list_favorite_documents: t("ai.tool.listFavoriteDocuments"),
                                  list_trashed_documents: t("ai.tool.listTrashedDocuments"),
                                  get_writing_range_stats: t("ai.tool.getWritingRangeStats"),
                                  get_weekly_writing_stats: t("ai.tool.getWeeklyWritingStats"),
                                  list_work_records: t("ai.tool.listWorkRecords"),
                                  get_current_work_record: t("ai.tool.getCurrentWorkRecord"),
                                  list_document_groups: t("ai.tool.listDocumentGroups"),
                                  list_document_versions: t("ai.tool.listDocumentVersions"),
                                  list_brain_knowledge: t("ai.tool.listBrainKnowledge"),
                                  search_brain_knowledge: t("ai.tool.searchBrainKnowledge"),
                                  list_brain_categories: t("ai.tool.listBrainCategories"),
                                  search_document_semantic: t("ai.tool.searchDocumentSemantic"),
                                  search_knowledge_semantic: t("ai.tool.searchKnowledgeSemantic"),
                                  get_rag_status: t("ai.tool.getRagStatus"),
                                };

                                return (
                                  <details
                                    className="mb-2 overflow-hidden rounded-xl border border-amber-200/70 bg-amber-50/45 dark:border-amber-500/15 dark:bg-amber-500/5"
                                    open={hasRunningTool}
                                  >
                                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] select-none text-amber-700 dark:text-amber-300">
                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs shadow-sm dark:bg-surface-900">🔧</span>
                                      <span className="font-semibold">{t("ai.toolTimeline")}</span>
                                      <span className="rounded-full border border-amber-200/70 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-500/15 dark:bg-surface-900/55 dark:text-amber-200">
                                        {doneCount}/{msg.toolCalls.length}
                                      </span>
                                      <span className="ml-auto flex items-center gap-1 shrink-0">
                                        {hasRunningTool ? (
                                          <InlineLoading
                                            variant="dots"
                                            size="sm"
                                            label={t("ai.toolRunning")}
                                            className="text-amber-400"
                                            labelClassName="text-[10px] text-amber-400"
                                          />
                                        ) : (
                                          <ChevronDown className="h-3.5 w-3.5 opacity-70 transition-transform duration-200 group-open:rotate-180" />
                                        )}
                                      </span>
                                    </summary>
                                    <div className="border-t border-amber-200/40 px-3 py-2 dark:border-amber-500/10">
                                      <div className="space-y-2">
                                        {msg.toolCalls.map((tc, i) => {
                                          const isSearch = tc.name === "search_web";
                                          const isCreate = tc.name === "create_document";
                                          const isUpdate = tc.name === "update_document";
                                          const isSpreadsheet = tc.name.includes("spreadsheet");
                                          const toolLabel = toolLabels[tc.name] || tc.name;
                                          const toolIcon = isSearch ? "🔍" : isSpreadsheet ? "📊" : isCreate || isUpdate ? "📝" : "🔧";
                                          const inProgress = tc.status === "calling";
                                          const done = tc.status === "done";
                                          const failed = tc.status === "error";
                                          const evidence = tc.summary || tc.result;

                                          return (
                                            <div
                                              key={`${tc.name}-${i}`}
                                              className="grid grid-cols-[22px_minmax(0,1fr)_18px] gap-2 rounded-lg bg-white/68 px-2.5 py-2 dark:bg-surface-900/55"
                                            >
                                              <span className="mt-0.5 text-xs">{toolIcon}</span>
                                              <div className="min-w-0">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                  <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                                                    {toolLabel}
                                                  </span>
                                                  {tc.arguments && (
                                                    <span className="max-w-full truncate rounded-full border border-amber-200/70 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-500/15 dark:text-amber-300">
                                                      {tc.arguments}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="mt-1 text-[10px] leading-relaxed text-surface-500 dark:text-surface-400">
                                                  <span className="font-medium text-surface-700 dark:text-surface-200">
                                                    {t("ai.toolEvidence")}
                                                  </span>
                                                  <span className="mx-1">·</span>
                                                  <span className="whitespace-pre-wrap break-words">
                                                    {evidence || t("ai.toolNoEvidence")}
                                                  </span>
                                                </div>
                                              </div>
                                              <span className="mt-0.5 flex items-center justify-center">
                                                {inProgress && <InlineLoading variant="dots" size="sm" className="text-amber-400" />}
                                                {done && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                                                {failed && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </details>
                                );
                              })()
                            )}
                            {/* Placeholder content when tool calls are happening but no text yet */}
                            {(!msg.content || msg.content === "") && msg.toolCalls && msg.toolCalls.some(tc => tc.status === "calling") && (
                              <div className="flex items-center gap-2 text-xs text-surface-400">
                                <InlineLoading variant="ai" size="sm" label={t("ai.toolWorking")} />
                              </div>
                            )}

                            <div
                              className="ai-chat-markdown"
                              dangerouslySetInnerHTML={{ __html: renderAiChatHtml(msg.content) }}
                            />
                            {msg.interrupted && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                  <XCircle className="h-3 w-3" />
                                  {t("ai.stopped")}
                                </div>
                                {isLastAssistant && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => handleContinue()}
                                  >
                                    {t("ai.continueGenerate")}
                                  </Button>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {!isUser && msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 border-t border-surface-200/70 pt-2 dark:border-surface-700/70">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-surface-400">
                              {t("ai.usedSources")}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {uniqueReferences(msg.sources).slice(0, 4).map((source) => (
                                <span
                                  key={source.id}
                                  className="inline-flex max-w-[160px] items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:bg-surface-900 dark:text-surface-400"
                                >
                                  {source.type === "brain" ? (
                                    <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
                                  ) : source.type === "spreadsheet" ? (
                                    <FileSpreadsheet className="h-3 w-3 shrink-0 text-emerald-500" />
                                  ) : (
                                    <FileText className="h-3 w-3 shrink-0 text-brand-500" />
                                  )}
                                  <span className="truncate">{source.type === "brain" ? "#" : source.type === "spreadsheet" ? "" : "@"}{source.title}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {streaming && isLastAssistant && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse rounded-sm align-middle" />
                        )}
                        {/* Timestamp */}
                        {msg.timestamp && (
                          <div className={cn(
                            "mt-1 text-[10px]",
                            isUser ? "text-white/70" : "text-surface-400 dark:text-surface-500"
                          )}>
                            {msg.timestamp}
                          </div>
                        )}
                        {/* Action buttons: regenerate + copy + feedback, appear on hover */}
                        {!isUser && !streaming && assistantActionContent.trim() && (
                          <div className={cn(
                            "absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 transition-opacity duration-200 flex flex-col gap-0.5",
                            msg.interrupted ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          )}>
                            {isLastAssistant && (
                              <Tooltip content={t("ai.regenerate")} delay={150} side="right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={t("ai.regenerate")}
                                  onClick={(e) => { e.stopPropagation(); handleRegenerate(); }}
                                  className="h-5 w-5 p-0.5 text-surface-300 hover:bg-surface-100 hover:text-amber-500"
                                >
                                  <RotateCcw className="h-3 w-3" />
                                </Button>
                              </Tooltip>
                            )}
                            <Tooltip content={copiedMsgIdx === i ? t("ai.copied") : t("ai.copy")} delay={150} side="right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={copiedMsgIdx === i ? t("ai.copied") : t("ai.copy")}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const div = document.createElement("div");
                                    div.innerHTML = renderAiChatHtml(assistantActionContent);
                                    const text = div.textContent || div.innerText || assistantActionContent;
                                    await navigator.clipboard.writeText(text);
                                    setCopiedMsgIdx(i);
                                    toast(t("ai.copied"), "success");
                                    setTimeout(() => setCopiedMsgIdx(null), 2000);
                                  } catch {
                                    toast(t("ai.copyFailed"), "error");
                                  }
                                }}
                                className="h-5 w-5 p-0.5 text-surface-300 hover:bg-surface-100 hover:text-brand-500"
                              >
                                {copiedMsgIdx === i ? <CopyCheck className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </Tooltip>
                            {canFeedback && !feedbackDoneRef.current.has(i) && (<>
                            <Tooltip content={t("ai.like")} delay={150} side="right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("ai.like")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (showRating && feedbackMsgIdx === i) {
                                    setClosingRating(true);
                                    setTimeout(() => { setShowRating(false); setFeedbackMsgIdx(null); setClosingRating(false); }, 180);
                                  } else {
                                    setFeedbackMsgIdx(i); setShowRating(true); setShowDislikeOpts(false);
                                  }
                                }}
                                className="h-5 w-5 p-0.5 text-surface-300 hover:bg-surface-100 hover:text-amber-500"
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                            </Tooltip>
                            <Tooltip content={t("ai.dislike")} delay={150} side="right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("ai.dislike")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (showDislikeOpts && feedbackMsgIdx === i) {
                                    setClosingDislike(true);
                                    setTimeout(() => { setShowDislikeOpts(false); setFeedbackMsgIdx(null); setClosingDislike(false); }, 180);
                                  } else {
                                    setFeedbackMsgIdx(i); setShowDislikeOpts(true); setShowRating(false);
                                  }
                                }}
                                className="h-5 w-5 p-0.5 text-surface-300 hover:bg-surface-100 hover:text-red-500"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                            </Tooltip>
                            </>)}
                            {/* Star rating popover */}
                            {showRating && feedbackMsgIdx === i && (
                              <div className={cn(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex items-center gap-0.5 bg-white border border-surface-200 rounded-lg px-1.5 py-1 shadow-sm dark:bg-surface-800 dark:border-surface-700 whitespace-nowrap",
                                closingRating ? "animate-out fade-out duration-150" : "animate-in fade-in duration-200"
                              )}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Button
                                    key={star}
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`${star} ${t("ai.like")}`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await api.sendFeedback({ messageContent: assistantActionContent, feedbackType: "like", rating: star });
                                      api.logActivity({ action: "chat_feedback", detail: `like:${star}` }).catch(() => {});
                                      toast(t("ai.feedbackThanks"), "success");
                                      feedbackDoneRef.current.add(i);
                                      setShowRating(false); setFeedbackMsgIdx(null);
                                    }}
                                    onMouseEnter={() => setHoverStar(star)}
                                    onMouseLeave={() => setHoverStar(0)}
                                    className="h-5 w-5 p-0.5 hover:scale-110"
                                  >
                                    <Star
                                      className={cn(
                                        "h-3.5 w-3.5 transition-colors",
                                        hoverStar >= star
                                          ? "fill-amber-500 text-amber-500"
                                          : "fill-transparent text-surface-300 dark:text-surface-500"
                                      )}
                                    />
                                  </Button>
                                ))}
                              </div>
                            )}
                            {/* Dislike options popover */}
                            {showDislikeOpts && feedbackMsgIdx === i && (
                              <div className={cn(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex flex-col gap-0.5 bg-white border border-surface-200 rounded-lg px-2 py-1.5 shadow-sm dark:bg-surface-800 dark:border-surface-700 whitespace-nowrap",
                                closingDislike ? "animate-out fade-out duration-150" : "animate-in fade-in duration-200"
                              )}>
                                {[t("ai.dislikeInaccurate"), t("ai.dislikeUnexpected"), t("ai.dislikeIncomplete"), t("ai.dislikeTone"), t("ai.dislikeOther")].map((reason) => (
                                  <Button
                                    key={reason}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await api.sendFeedback({ messageContent: assistantActionContent, feedbackType: "dislike", reason });
                                      api.logActivity({ action: "chat_feedback", detail: `dislike:${reason}` }).catch(() => {});
                                      toast(t("ai.feedbackThanks"), "success");
                                      feedbackDoneRef.current.add(i);
                                      setShowDislikeOpts(false); setFeedbackMsgIdx(null);
                                    }}
                                    className="h-auto rounded-full px-2 py-0.5 text-[10px] text-surface-500 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950"
                                  >
                                    {reason}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Thinking/Action indicator */}
                {loading && !streaming && (
                  <div className="mb-4 flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 mt-0.5 overflow-hidden">
                      <img src={catAvatar} alt={t("ai.title")} className="h-7 w-7 object-cover" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-100 px-4 py-3 dark:bg-surface-800">
                      <InlineLoading
                        variant={isActing ? "cursor" : "ai"}
                        size="sm"
                        label={isActing ? t("ai.action") : t("ai.thinking")}
                        className="text-brand-500 dark:text-brand-300"
                        labelClassName="text-xs text-surface-500 dark:text-surface-400"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </Scrollbar>

          {/* Delete selected bar */}
          {editMode && selectedMsgs.size > 0 && (
            <div data-ai-chat-enter className="shrink-0 border-t border-surface-200 bg-red-50 px-4 py-2 flex items-center justify-between dark:bg-red-950 dark:border-surface-700">
              <span className="text-xs text-red-600 dark:text-red-400">
                {t("ai.selectedMessages").replace("{count}", String(selectedMsgs.size))}
              </span>
              <Button size="sm" variant="destructive" disabled={isGenerating} onClick={() => setDeleteMsgConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("common.delete")}
              </Button>
            </div>
          )}

          {/* Input */}
          <div data-ai-chat-enter className="shrink-0 border-t border-surface-200 px-3 py-3 dark:border-surface-700">
            {references.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-surface-400">{t("ai.referenceContext")}</span>
                {references.map((ref) => (
                  <span
                    key={ref.id}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-medium text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  >
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">@{ref.title}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("ai.removeReference")}
                      onClick={() => removeReference(ref)}
                      className="h-5 w-5 rounded-full p-0.5 text-brand-400 hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-900 dark:hover:text-brand-200"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
            {(brainReferences.length > 0 || autoBrainReferences.length > 0) && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-surface-400">{t("ai.brainContext")}</span>
                {brainReferences.map((ref) => (
                  <span
                    key={ref.id}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">#{ref.title}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("ai.removeBrainReference")}
                      onClick={() => removeBrainReference(ref)}
                      className="h-5 w-5 rounded-full p-0.5 text-amber-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900 dark:hover:text-amber-200"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
                {autoBrainReferences.map((ref) => (
                  <span
                    key={`auto-${ref.id}`}
                    className="inline-flex max-w-[210px] items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">#{ref.title}</span>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] dark:bg-emerald-900">
                      {t("rag.autoReference")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("ai.removeBrainReference")}
                      onClick={() => removeAutoBrainReference(ref)}
                      className="h-5 w-5 rounded-full p-0.5 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900 dark:hover:text-emerald-200"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative px-4 pb-4 pt-2" ref={senderRef}>
              <div className="flex items-end gap-2 rounded-2xl border border-surface-200 bg-white p-2 shadow-sm transition-colors focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-200/60 dark:border-surface-700 dark:bg-surface-900 dark:focus-within:border-brand-500 dark:focus-within:ring-brand-500/20">
                <Textarea
                  ref={chatInputRef}
                  value={input}
                  maxLength={MAX_CHAT_INPUT_CHARS}
                  onChange={(event) => handleInputChange(event.target.value)}
                  placeholder={isGenerating ? t("ai.replying") : t("ai.placeholder")}
                  disabled={isGenerating}
                  aria-label={t("ai.placeholder")}
                  className="min-h-[52px] flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-2.5 shadow-none focus-visible:ring-0 dark:bg-transparent"
                />
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {input.length >= 10_000 && (
                    <span className="px-1 text-[10px] tabular-nums text-surface-400">
                      {t("ai.inputLimit")
                        .replace("{count}", input.length.toLocaleString())
                        .replace("{max}", MAX_CHAT_INPUT_CHARS.toLocaleString())}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant={isGenerating ? "outline" : "default"}
                    disabled={!isGenerating && !input.trim()}
                    onClick={() => { if (isGenerating) handleStop(); else void handleSend(); }}
                    aria-label={isGenerating ? t("ai.stop") : t("ai.send")}
                    className="h-9 w-9 rounded-xl"
                  >
                    {isGenerating ? <Square className="h-3.5 w-3.5" /> : <SendHorizontal className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {showMentionMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-full overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                  {mentionMatches.length > 0 ? (
                    mentionMatches.map((doc, idx) => (
                      <Button
                        key={doc.id}
                        type="button"
                        variant="ghost"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setMentionIndex(idx)}
                        onClick={() => selectReference(doc)}
                        className={`flex h-auto min-h-8 w-full justify-start gap-2 rounded-none px-3 py-2 text-left text-xs ${
                          idx === mentionIndex
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                            : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                        <span className="truncate">@{doc.title}</span>
                      </Button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-surface-400">{t("ai.noMatchingDocs")}</div>
                  )}
                </div>
              )}
              {showBrainMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-full overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                  {brainMatches.length > 0 ? (
                    brainMatches.map((item, idx) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setBrainIndex(idx)}
                        onClick={() => selectBrainReference(item)}
                        className={cn(
                          "flex h-auto min-h-8 w-full justify-start gap-2 rounded-none px-3 py-2 text-left text-xs",
                          idx === brainIndex
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                        )}
                      >
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">#{item.title}</span>
                        {item.category && <span className="ml-auto shrink-0 text-[10px] text-surface-400">{item.category}</span>}
                      </Button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-surface-400">{t("ai.noMatchingBrain")}</div>
                  )}
                </div>
              )}
              {showCommandMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-full overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                  {commandMatches.map((command, idx) => (
                    <Button
                      key={command.id}
                      type="button"
                      variant="ghost"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setCommandIndex(idx)}
                      onClick={() => selectCommand(command)}
                      className={cn(
                        "flex h-auto min-h-8 w-full justify-start gap-2 rounded-none px-3 py-2 text-left text-xs",
                        idx === commandIndex
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                          : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span className="font-medium">{command.label}</span>
                      <span className="min-w-0 truncate text-surface-400">{command.prompt}</span>
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-[10px] text-surface-400 dark:text-surface-500">
              <span>{t("ai.mentionHint")}</span>
              <span>{t("ai.brainHint")}</span>
              <span>{t("ai.commandHint")}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAutoReference}
                className={cn(
                  "h-5 px-1.5 text-[10px]",
                  autoReferenceEnabled
                    ? "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                    : "text-surface-400"
                )}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {autoReferenceLoading ? t("rag.searching") : t("rag.autoReferenceToggle")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={!!pendingUpdate} onOpenChange={(open) => {
        if (!open && !applyingUpdate) setPendingUpdate(null);
      }}>
        <DialogContent className="flex max-h-[86vh] max-w-[880px] flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-surface-200 px-6 py-5 dark:border-surface-700">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <DialogTitle className="text-base font-bold text-surface-900 dark:text-surface-100">
                  {t("ai.diffTitle")}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed">
                  {t("ai.diffDesc")}
                </DialogDescription>
              </div>
              {pendingUpdate && (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    +{pendingUpdate.stats.added} {t("ai.diffAdded")}
                  </span>
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">
                    -{pendingUpdate.stats.removed} {t("ai.diffRemoved")}
                  </span>
                </div>
              )}
            </div>
            {pendingUpdate && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">{t("ai.diffDocument")}</span>
                <span className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{pendingUpdate.title}</span>
              </div>
            )}
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {taskSteps.map((step, index) => {
                const done = taskStage === "done" || (activeTaskIndex !== -1 && index < activeTaskIndex);
                const active = step.stage === taskStage;
                return (
                  <div key={step.stage} className="min-w-0">
                    <div
                      className={cn(
                        "mb-1 h-1.5 rounded-full transition-colors",
                        done && "bg-brand-500",
                        active && "bg-brand-300 dark:bg-brand-500",
                        !done && !active && "bg-surface-200 dark:bg-surface-700"
                      )}
                    />
                    <div className="truncate text-center text-[10px] text-surface-400">{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {pendingUpdate && (
            <div className="grid min-h-[320px] flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.95fr)]">
              <section className="flex min-h-0 flex-col overflow-hidden border-b border-surface-200 dark:border-surface-700 lg:border-b-0 lg:border-r">
                <div className="grid shrink-0 grid-cols-[96px_1fr] border-b border-surface-200 bg-surface-50 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400">
                  <div className="border-r border-surface-200 px-4 py-2 dark:border-surface-700">{t("ai.diffOld")} / {t("ai.diffNew")}</div>
                  <div className="px-4 py-2">
                    {t("ai.diffTextChanges")} · {pendingUpdate.stats.unchanged} {t("ai.diffUnchanged")}
                  </div>
                </div>

                <Scrollbar className="flex-1">
                  <div className="divide-y divide-surface-100 dark:divide-surface-800">
                    {(pendingUpdate?.diffLines || []).map((line, index) => (
                      <div
                        key={`${line.type}-${index}`}
                        className={cn(
                          "grid grid-cols-[96px_1fr] text-sm leading-relaxed",
                          line.type === "added" && "bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                          line.type === "removed" && "bg-red-50/70 text-red-900 dark:bg-red-950/40 dark:text-red-100",
                          line.type === "unchanged" && "text-surface-600 dark:text-surface-300"
                        )}
                      >
                        <div className="select-none border-r border-surface-100 px-4 py-2 font-mono text-xs dark:border-surface-800">
                          {line.type === "added" ? `+ ${t("ai.diffNew")}` : line.type === "removed" ? `- ${t("ai.diffOld")}` : " "}
                        </div>
                        <div className="whitespace-pre-wrap px-4 py-2">{line.text}</div>
                      </div>
                    ))}
                  </div>
                </Scrollbar>
              </section>

              <section className="flex min-h-0 flex-col overflow-hidden bg-white dark:bg-surface-900">
                <div className="shrink-0 border-b border-surface-200 bg-surface-50 px-4 py-2 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400">
                  {t("ai.diffRenderedPreview")}
                </div>
                <Scrollbar className="flex-1">
                  <article
                    className="max-w-none px-5 py-4 text-sm leading-7 text-surface-800 dark:text-surface-100 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-200 [&_blockquote]:pl-4 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: pendingUpdate.nextHtml }}
                  />
                </Scrollbar>
              </section>
            </div>
          )}

          <div className="shrink-0 flex items-center justify-end gap-2 bg-white px-6 py-4 dark:bg-surface-900">
            <Button variant="outline" onClick={() => setPendingUpdate(null)} disabled={applyingUpdate}>
              {t("ai.diffCancel")}
            </Button>
            <Button onClick={applyPendingUpdate} disabled={applyingUpdate}>
              {applyingUpdate ? t("ai.docActionRunning") : t("ai.diffApply")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingCreate} onOpenChange={(open) => {
        if (!open && !applyingCreate) setPendingCreate(null);
      }}>
        <DialogContent className="flex max-h-[86vh] max-w-[720px] flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-surface-200 px-6 py-5 dark:border-surface-700">
            <DialogTitle className="text-base font-bold text-surface-900 dark:text-surface-100">
              {t("ai.createPreviewTitle")}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed">
              {t("ai.createPreviewDesc")}
            </DialogDescription>
            {pendingCreate && (
              <div className="mt-4 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 text-sm font-semibold dark:border-surface-700 dark:bg-surface-800">
                {pendingCreate.title}
              </div>
            )}
          </div>
          {pendingCreate && (
            <Scrollbar className="min-h-0 flex-1">
              <article
                className="max-w-none px-5 py-4 text-sm leading-7 text-surface-800 dark:text-surface-100"
                dangerouslySetInnerHTML={{ __html: pendingCreate.html }}
              />
            </Scrollbar>
          )}
          <div className="shrink-0 flex items-center justify-end gap-2 bg-white px-6 py-4 dark:bg-surface-900">
            <Button variant="outline" onClick={() => setPendingCreate(null)} disabled={applyingCreate}>
              {t("ai.createReject")}
            </Button>
            <Button onClick={() => void applyPendingCreate()} disabled={applyingCreate}>
              {applyingCreate ? t("ai.docActionRunning") : t("ai.createAccept")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmClosePending} onOpenChange={setConfirmClosePending}>
        <DialogContent className="max-w-md">
          <DialogTitle>{t("common.confirm")}</DialogTitle>
          <DialogDescription>{t("ai.closePendingWarn")}</DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmClosePending(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setPendingUpdate(null);
                setPendingCreate(null);
                setPendingSpreadsheetPatch(null);
                setConfirmClosePending(false);
                setOpen(false);
              }}
            >
              {t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingSpreadsheetPatch} onOpenChange={(open) => {
        if (!open && !applyingSpreadsheetPatch) setPendingSpreadsheetPatch(null);
      }}>
        <DialogContent className="flex max-h-[86vh] max-w-[1040px] flex-col overflow-hidden p-0">
          <div className="shrink-0 border-b border-surface-200 px-6 py-5 dark:border-surface-700">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <DialogTitle className="text-base font-bold text-surface-900 dark:text-surface-100">
                  {t("ai.spreadsheetPatchTitle")}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed">
                  {t("ai.spreadsheetPatchDesc")}
                </DialogDescription>
              </div>
              {pendingSpreadsheetPatch && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {pendingSpreadsheetPatch.operationCount} {t("ai.spreadsheetPatchOperations")}
                </span>
              )}
            </div>
            {pendingSpreadsheetPatch && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-xs font-medium text-surface-500 dark:text-surface-400">{t("ai.spreadsheetPatchTarget")}</span>
                <span className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{pendingSpreadsheetPatch.title}</span>
              </div>
            )}
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {taskSteps.map((step, index) => {
                const done = taskStage === "done" || (activeTaskIndex !== -1 && index < activeTaskIndex);
                const active = step.stage === taskStage;
                return (
                  <div key={step.stage} className="min-w-0">
                    <div
                      className={cn(
                        "mb-1 h-1.5 rounded-full transition-colors",
                        done && "bg-brand-500",
                        active && "bg-brand-300 dark:bg-brand-500",
                        !done && !active && "bg-surface-200 dark:bg-surface-700"
                      )}
                    />
                    <div className="truncate text-center text-[10px] text-surface-400">{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {pendingSpreadsheetPatch && (
            <div className="min-h-[360px] flex-1 overflow-hidden bg-surface-50 p-4 dark:bg-surface-950">
              <div className="mb-3 text-xs font-semibold text-surface-500 dark:text-surface-400">
                {t("ai.spreadsheetPatchRenderedPreview")}
              </div>
              <SpreadsheetPatchPreview
                previousWorkbook={pendingSpreadsheetPatch.previousWorkbook}
                nextWorkbook={pendingSpreadsheetPatch.nextWorkbook}
                summary={pendingSpreadsheetPatch.summary}
              />
            </div>
          )}

          <div className="shrink-0 flex items-center justify-end gap-2 bg-white px-6 py-4 dark:bg-surface-900">
            <Button variant="outline" onClick={() => setPendingSpreadsheetPatch(null)} disabled={applyingSpreadsheetPatch}>
              {t("ai.diffCancel")}
            </Button>
            <Button onClick={applyPendingSpreadsheetPatch} disabled={applyingSpreadsheetPatch}>
              {applyingSpreadsheetPatch ? t("ai.docActionRunning") : t("ai.spreadsheetPatchApply")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {spreadsheetUndo && open && (
        <div className="pointer-events-auto fixed bottom-24 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 shadow-lg dark:border-surface-700 dark:bg-surface-900">
          <span className="text-xs text-surface-600 dark:text-surface-300">{spreadsheetUndo.title}</span>
          <Button type="button" size="sm" variant="outline" disabled={applyingSpreadsheetPatch} onClick={() => void undoSpreadsheetPatch()}>
            {t("ai.spreadsheetUndo")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSpreadsheetUndo(null)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      <Dialog open={versionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent className="max-h-[82vh] max-w-[640px] overflow-hidden p-0">
          <div className="border-b border-surface-200 px-6 py-5 dark:border-surface-700">
            <div className="flex items-start gap-3 pr-8">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                <History className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-surface-900 dark:text-surface-100">
                  {t("ai.versionHistory")}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed">
                  {t("ai.versionHistoryDesc")}
                </DialogDescription>
              </div>
            </div>
          </div>

          <Scrollbar className="max-h-[54vh] min-h-[240px]">
            <div className="space-y-2 p-4">
              {versionLoading ? (
                <div className="flex h-40 items-center justify-center text-sm text-surface-500">
                  <InlineLoading variant="dots" size="md" label={t("loading.versions")} />
                </div>
              ) : versions.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-surface-200 bg-surface-50 text-center dark:border-surface-700 dark:bg-surface-800">
                  <History className="mb-2 h-5 w-5 text-surface-400" />
                  <p className="text-sm font-medium text-surface-600 dark:text-surface-300">{t("ai.versionEmpty")}</p>
                </div>
              ) : (
                versions.map((version) => {
                  const createdAt = new Intl.DateTimeFormat(undefined, {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(version.createdAt));
                  const preview = htmlToPlainText(version.content).slice(0, 120);
                  return (
                    <div
                      key={version.id}
                      className="group rounded-xl border border-surface-200 bg-white p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40 dark:border-surface-700 dark:bg-surface-900 dark:hover:border-brand-800 dark:hover:bg-brand-950/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
                              {version.title}
                            </span>
                            <span className="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:bg-surface-800 dark:text-surface-400">
                              {versionSourceLabel(version.source)}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-surface-400">
                            <Clock3 className="h-3 w-3" />
                            <span>{createdAt}</span>
                          </div>
                          {preview && (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-surface-500 dark:text-surface-400">
                              {preview}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restoreVersion(version)}
                          disabled={!!restoringVersionId}
                          className="shrink-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          {restoringVersionId === version.id ? t("ai.docActionRunning") : t("ai.versionRestore")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Scrollbar>
        </DialogContent>
      </Dialog>

      {/* Delete selected messages confirmation */}
      <ConfirmModal
        open={deleteMsgConfirm}
        onOpenChange={setDeleteMsgConfirm}
        title={t("ai.deleteMessagesTitle")}
        description={t("ai.deleteMessagesDesc").replace("{count}", String(selectedMsgs.size))}
        confirmLabel={t("ai.deleteSelectedConfirm")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={async () => {
          if (isGenerating) return;
          const indices = Array.from(selectedMsgs).sort((a, b) => b - a);
          const newMsgs = [...messages];
          indices.forEach((idx) => newMsgs.splice(idx, 1));
          const hasRemainingConversation = hasMeaningfulUserTurn(newMsgs);

          if (!hasRemainingConversation) {
            try {
              await saveChainRef.current;
              await api.deleteConversation(conversationId);
            } catch {
              toast(t("ai.sessionDeleteFailed"), "error");
              return;
            }
          }

          setMessages(newMsgs);
          memoryRef.current = newMsgs;
          saveMemory(memoryScope, newMsgs);
          // Reset feedback tracking since indices shifted
          feedbackDoneRef.current = new Set();
          setSelectedMsgs(new Set());
          api.logActivity({ action: "chat_delete", detail: `deleted_${selectedMsgs.size}_msgs` }).catch(() => {});
          toast(t("ai.messageDeleted"), "success");
          setDeleteMsgConfirm(false);

          if (hasRemainingConversation) {
            const normalizedMessages = newMsgs.map((message) => {
              if (message.role !== "assistant") return message;
              const { finalContent, isTyping, ...rest } = message;
              return {
                ...rest,
                content: resolveStoredAssistantContent({
                  displayContent: message.content,
                  finalContent,
                }),
              };
            });
            await queueConversationSave(normalizedMessages as Message[], conversationId, personalityRef.current);
          } else {
            setSessions((prev) => prev.filter((session) => session.id !== conversationId));
            const nextConversationId = createClientConversationId();
            const requestEpoch = chatViewEpochRef.current + 1;
            chatViewEpochRef.current = requestEpoch;
            setConversationId(nextConversationId);
            saveActiveConversationId(memoryScope, nextConversationId);
            setMessages([]);
            memoryRef.current = [];
            saveMemory(memoryScope, []);
            greetUser(requestEpoch);
          }
        }}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title={t("ai.clearConfirmTitle")}
        description={t("ai.clearConfirmDesc")}
        confirmLabel={t("ai.clearConfirmBtn")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={async () => {
          try {
            await saveChainRef.current;
            await api.deleteConversations();
            const nextConversationId = createClientConversationId();
            chatViewEpochRef.current += 1;
            setConversationId(nextConversationId);
            saveActiveConversationId(memoryScope, nextConversationId);
            setMessages([]);
            memoryRef.current = [];
            clearLocalMemoryCache(memoryScope);
            setSessions([]);
            api.logActivity({ action: "chat_clear" }).catch(() => {});
            toast(t("ai.cleared"), "success");
          } catch {
            toast(t("ai.clearFailed"), "error");
          }
          setDeleteConfirm(false);
        }}
      />
    </>
  );
}
