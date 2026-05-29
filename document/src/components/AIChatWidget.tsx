import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Sparkles, Smile, ChevronDown, ThumbsUp, ThumbsDown, Star, Trash2, Check, Pencil, Square, FileText, History, RotateCcw, Clock3 } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Scrollbar } from "@/components/ui/scrollbar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { markdownToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/html";
import { Tooltip } from "@/components/ui/tooltip";
import type { DocumentVersion } from "@/types";

const API_BASE = "http://localhost:3000/api";

type Personality = "normal" | "cute" | "catgirl" | "serious" | "silly";

const VALID_PERSONALITIES: Personality[] = ["normal", "cute", "catgirl", "serious", "silly"];

function safePersonality(raw: string | null): Personality {
  if (raw && VALID_PERSONALITIES.includes(raw as Personality)) return raw as Personality;
  return "normal";
}

const PERSONALITY_OPTIONS: { key: Personality; label: string; emoji: string }[] = [
  { key: "normal", label: "正常", emoji: "✨" },
  { key: "cute", label: "可爱", emoji: "🌸" },
  { key: "catgirl", label: "猫娘", emoji: "🐱" },
  { key: "serious", label: "严肃", emoji: "📋" },
  { key: "silly", label: "搞怪", emoji: "🤪" },
];

const MEMORY_KEY = "znwriter_ai_memory";
const PERSONALITY_KEY = "znwriter_ai_personality";
const MAX_MEMORY_MESSAGES = 20;

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: ChatReference[];
}

interface ChatReference {
  type: "document" | "brain";
  id: string;
  title: string;
}

type DocumentReference = ChatReference & { type: "document" };
type BrainReference = ChatReference & { type: "brain" };

interface BrainKnowledge {
  id: string;
  title: string;
  description: string;
  category: string;
}

interface AIChatWidgetProps {
  currentDocumentId?: string;
}

type SlashCommand = {
  id: string;
  label: string;
  prompt: string;
};

type TaskStage = "idle" | "analyzing" | "generating" | "preview" | "snapshot" | "verify" | "done";

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

type PendingDocumentUpdate = {
  docId: string;
  title: string;
  nextMarkdown: string;
  nextHtml: string;
  diffLines: DiffLine[];
  stats: {
    added: number;
    removed: number;
    unchanged: number;
  };
};

interface Position {
  x: number;
  y: number;
}

interface AnchoredPosition {
  side: "left" | "right";
  yPercent: number; // 0-100, percentage from top
}

function anchoredToAbsolute(anchor: AnchoredPosition): Position {
  const MARGIN = 16;
  const btnSize = 56;
  const x = anchor.side === "left" ? MARGIN : window.innerWidth - btnSize - MARGIN;
  const maxY = window.innerHeight - btnSize - MARGIN;
  const y = Math.max(MARGIN, Math.min(maxY, MARGIN + (maxY - MARGIN) * (anchor.yPercent / 100)));
  return { x, y };
}

function absoluteToAnchored(pos: Position): AnchoredPosition {
  const MARGIN = 16;
  const btnSize = 56;
  const maxX = window.innerWidth - btnSize - MARGIN;
  const side: "left" | "right" = pos.x < maxX / 2 ? "left" : "right";
  const maxY = window.innerHeight - btnSize - MARGIN;
  const yPercent = Math.max(0, Math.min(100, ((pos.y - MARGIN) / (maxY - MARGIN)) * 100));
  return { side, yPercent };
}

function loadMemory(): Message[] {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]"); } catch { return []; }
}

function saveMemory(messages: Message[]) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-MAX_MEMORY_MESSAGES)));
}

function htmlToPlainText(html: string): string {
  const withLineBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n");
  if (typeof window === "undefined") return withLineBreaks.replace(/<[^>]*>/g, "");
  const container = window.document.createElement("div");
  container.innerHTML = withLineBreaks;
  return container.textContent || "";
}

function splitComparableLines(value: string): string[] {
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [value.trim()].filter(Boolean);
}

function buildDiffLines(beforeText: string, afterText: string): PendingDocumentUpdate["diffLines"] {
  const before = splitComparableLines(beforeText);
  const after = splitComparableLines(afterText);
  if (before.length === 0 && after.length === 0) return [];

  // Keep the preview lightweight for very long documents.
  if (before.length * after.length > 40000) {
    const rows: DiffLine[] = [];
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i += 1) {
      if (before[i] === after[i]) {
        rows.push({ type: "unchanged", text: before[i] });
      } else {
        if (before[i]) rows.push({ type: "removed", text: before[i] });
        if (after[i]) rows.push({ type: "added", text: after[i] });
      }
    }
    return rows;
  }

  const dp = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      rows.push({ type: "unchanged", text: before[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "removed", text: before[i] });
      i += 1;
    } else {
      rows.push({ type: "added", text: after[j] });
      j += 1;
    }
  }
  while (i < before.length) {
    rows.push({ type: "removed", text: before[i] });
    i += 1;
  }
  while (j < after.length) {
    rows.push({ type: "added", text: after[j] });
    j += 1;
  }
  return rows;
}

function summarizeDiff(lines: DiffLine[]) {
  return lines.reduce(
    (stats, line) => {
      stats[line.type] += 1;
      return stats;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

function uniqueReferences<T extends ChatReference>(refs: T[]) {
  return refs.filter(
    (ref, index, all) => all.findIndex((item) => `${item.type}:${item.id}` === `${ref.type}:${ref.id}`) === index
  );
}

function buildMemoryContext(memory: Message[]): string {
  if (memory.length === 0) return "";
  return memory.map((m) => {
    const role = m.role === "user" ? "用户" : "助手";
    return `${role}: ${m.content.slice(0, 200)}`;
  }).join("\n");
}

function getMentionQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)@([^\s@]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

function getSlashQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)\/([^\s/]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

function getBrainQuery(value: string): { query: string; start: number } | null {
  const match = value.match(/(^|\s)#([^\s#]*)$/);
  if (!match || match.index === undefined) return null;
  return { query: match[2] || "", start: match.index + match[1].length };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTokenDeletionRange(
  value: string,
  cursor: number,
  key: "Backspace" | "Delete",
  refs: ChatReference[],
  prefix: "@" | "#"
): { start: number; end: number } | null {
  const orderedRefs = [...refs].sort((a, b) => b.title.length - a.title.length);
  for (const ref of orderedRefs) {
    const token = `${prefix}${ref.title}`;
    let start = value.indexOf(token);
    while (start !== -1) {
      const end = start + token.length;
      const hasValidBefore = start === 0 || /\s/.test(value[start - 1]);
      const hasValidAfter = end === value.length || /\s/.test(value[end]);
      if (hasValidBefore && hasValidAfter) {
        if (key === "Backspace") {
          if (cursor > start && cursor <= end) return { start, end };
          if (cursor === end + 1 && /\s/.test(value[end])) return { start, end: cursor };
        } else if (cursor >= start && cursor < end) {
          return { start, end };
        }
      }
      start = value.indexOf(token, end);
    }
  }
  return null;
}

async function streamChat(
  data: { messages: Message[]; personality: string; memoryContext: string; references?: ChatReference[] },
  onDelta: (delta: string) => void,
  signal: AbortSignal
): Promise<{ reply: string; action: any }> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
    signal,
  });

  const ct = res.headers.get("content-type") || "";

  // Handle error responses
  if (!res.ok) {
    if (ct.includes("application/json")) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}`);
  }

  // Handle JSON response (security block, non-streaming)
  if (ct.includes("application/json")) {
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { reply: json.reply || "", action: json.action || null };
  }

  // Handle SSE streaming response
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let finalReply = "";
  let finalAction = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      // Skip SSE comments (e.g., ":ok")
      if (trimmed.startsWith("data: :")) continue;
      try {
        const parsed = JSON.parse(trimmed.slice(6));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) {
          fullContent += parsed.delta;
          onDelta(parsed.delta);
        }
        if (parsed.done) {
          finalReply = parsed.reply;
          finalAction = parsed.action;
        }
      } catch (e: any) {
        if (!(e instanceof SyntaxError)) throw e;
      }
    }
  }

  // Fallback: if no done event received, use accumulated content
  if (!finalReply && fullContent) {
    finalReply = fullContent;
  }

  return { reply: finalReply, action: finalAction };
}

export function AIChatWidget({ currentDocumentId }: AIChatWidgetProps) {
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
  } = useDocuments();
  const { user } = useAuth();
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
  const memoryRef = useRef<Message[]>(loadMemory());
  const abortRef = useRef<AbortController | null>(null);
  const [feedbackMsgIdx, setFeedbackMsgIdx] = useState<number | null>(null);
  const [showRating, setShowRating] = useState(false);
  const [showDislikeOpts, setShowDislikeOpts] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [closingRating, setClosingRating] = useState(false);
  const [closingDislike, setClosingDislike] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedMsgs, setSelectedMsgs] = useState<Set<number>>(new Set());
  const [deleteMsgConfirm, setDeleteMsgConfirm] = useState(false);
  const feedbackDoneRef = useRef<Set<number>>(new Set());
  const restoredRef = useRef(false);
  const [keyOk, setKeyOk] = useState(false);
  const [references, setReferences] = useState<DocumentReference[]>([]);
  const [brainReferences, setBrainReferences] = useState<BrainReference[]>([]);
  const [brainKnowledges, setBrainKnowledges] = useState<BrainKnowledge[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainIndex, setBrainIndex] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const [pendingUpdate, setPendingUpdate] = useState<PendingDocumentUpdate | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionLoading, setVersionLoading] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [taskStage, setTaskStage] = useState<TaskStage>("idle");

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

  // Save conversation to DB
  const saveConversation = useCallback(async () => {
    if (messages.length === 0 || saving) return;
    setSaving(true);
    try {
      await api.saveConversation({ messages, personality: personalityRef.current });
    } catch { /* silent */ }
    setSaving(false);
  }, [messages, saving]);

  // Drag - restore saved position or default bottom-left
  const [pos, setPos] = useState<Position>(() => {
    try {
      const saved = localStorage.getItem("chat-btn-pos");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Support new edge-anchored format
        if (parsed.side && typeof parsed.yPercent === "number") {
          return anchoredToAbsolute(parsed as AnchoredPosition);
        }
        // Legacy absolute format fallback
        return { x: parsed.x, y: parsed.y };
      }
    } catch {}
    return anchoredToAbsolute({ side: "left", yPercent: 90 });
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // User avatar
  const avatarUrl = user?.avatar ? `http://localhost:3000/uploads/${user.avatar}` : null;
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
            setPos(anchoredToAbsolute(parsed as AnchoredPosition));
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
    return () => window.removeEventListener("resize", updatePos);
  }, []);

  // On close: abort any ongoing stream and save. On open: check API key.
  useEffect(() => {
    if (!open) {
      if (messages.length > 0) {
        api.saveConversation({ messages, personality: personalityRef.current }).catch(() => {});
      }
      restoredRef.current = false;
      setKeyOk(false);
      // Abort any ongoing stream when closing
      if (abortRef.current) {
        abortRef.current.abort();
      }
      return;
    }
    // Verify API key before proceeding
    api.getApiKey().then((res) => {
      if (!res.hasKey) {
        toast(t("ai.needApiKey"), "error");
        setOpen(false);
      } else {
        setKeyOk(true);
      }
    }).catch(() => {
      toast(t("ai.needApiKey"), "error");
      setOpen(false);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // On keyOk: restore from DB or greet. On personality change: re-greet.
  useEffect(() => {
    if (!open || !keyOk) return;
    // Log open
    api.logActivity({ action: "chat_open", detail: personalityRef.current }).catch(() => {});

    // Try to restore last conversation from DB
    if (!restoredRef.current) {
      restoredRef.current = true;
      api.getConversations().then((res) => {
        if (res.conversations.length > 0) {
          const last = res.conversations[0];
          const msgs = last.messages as Message[];
          if (msgs.length > 0) {
            setMessages(msgs);
            memoryRef.current = msgs;
            return;
          }
        }
        // No saved conversation — greet
        greetUser();
      }).catch(() => greetUser());
    } else {
      greetUser();
    }
  }, [open, keyOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-greet on personality change (only if already open)
  useEffect(() => {
    if (open && restoredRef.current) {
      greetUser();
    }
  }, [personality]); // eslint-disable-line react-hooks/exhaustive-deps

  const greetUser = useCallback(() => {
    const pers = personalityRef.current;
    api.aiGreeting({ userName: user?.name || "", personality: pers })
      .then((res) => {
        setMessages([{ role: "assistant", content: res.greeting }]);
        memoryRef.current = [{ role: "assistant", content: res.greeting }];
        saveMemory(memoryRef.current);
      })
      .catch(() => {
        const fallbacks: Record<Personality, string> = {
          normal: `${user?.name || '用户'} 您好！我是小麦，很高兴见到您！`,
          cute: `${user?.name || '用户'} 您好呀~ 我是小麦呢 💕 一起开心地写作吧！🌸✨`,
          catgirl: `${user?.name || '用户'} 您好喵~！我是小麦喵~ 今天想写点什么呢？`,
          serious: `${user?.name || '用户'}，您好。我是小麦，请说明您的需求。`,
          silly: `哇哦！${user?.name || '用户'} 来了！我是小麦——您的写作小伙伴！`,
        };
        setMessages([{ role: "assistant", content: fallbacks[pers] || fallbacks.normal }]);
      });
  }, [user?.name]);

  // Smart auto-scroll: only scroll to bottom if user is near the bottom
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    chatEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  // Reset scroll lock when user sends a new message
  useEffect(() => {
    if (loading) userScrolledUpRef.current = false;
  }, [loading]);

  // Handle scroll events for smart scroll detection
  const handleScrollEvent = useCallback((_instance: any, event: Event) => {
    const target = event.target as HTMLElement;
    if (!target) return;
    const { scrollTop, scrollHeight, clientHeight } = target;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 80;
  }, []);

  // Auto-resize textarea helper
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minHeight = 42;
    const maxHeight = 112; // ~5 lines
    const nextHeight = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      if (!detail?.text) return;
      setInput(detail.text);
      setOpen(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        resizeTextarea();
      });
    };
    window.addEventListener("znwriter-ai-chat-prefill", handler);
    return () => window.removeEventListener("znwriter-ai-chat-prefill", handler);
  }, [resizeTextarea]);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const changePersonality = useCallback((p: Personality) => {
    personalityRef.current = p;
    setPersonality(p);
    setPersonalityOpen(false);
    localStorage.setItem(PERSONALITY_KEY, p);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (open) return;
    setDragging(true);
    hasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
  };

  useEffect(() => {
    if (!dragging) return;
    const mm = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 56, posStart.current.x + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 56, posStart.current.y + dy)),
      });
    };
    const mu = (e: MouseEvent) => {
      setDragging(false);
      if (!hasMoved.current) {
        setOpen(true);
      } else {
        // Snap to nearest edge
        const MARGIN = 16;
        const btnSize = 56;
        const maxX = window.innerWidth - btnSize - MARGIN;
        const maxY = window.innerHeight - btnSize - MARGIN;
        const currentX = posStart.current.x + (e.clientX - dragStart.current.x);
        const currentY = posStart.current.y + (e.clientY - dragStart.current.y);
        const distLeft = currentX - MARGIN;
        const distRight = maxX - currentX;
        const snapX = distLeft < distRight ? MARGIN : maxX;
        const snapY = Math.max(MARGIN, Math.min(maxY, currentY));
        const snapped = { x: snapX, y: snapY };
        setPos(snapped);
        // Store as edge-anchored responsive format
        const anchored = absoluteToAnchored(snapped);
        try { localStorage.setItem("chat-btn-pos", JSON.stringify(anchored)); } catch {}
      }
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [dragging, pos]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || streaming) return;

    const currentDocument = currentDocumentId ? getDocument(currentDocumentId) : undefined;
    // Always pass current document as context for LLM-based intent detection
    const currentReference = currentDocument && !currentDocument.isDeleted
      ? [{ type: "document" as const, id: currentDocument.id, title: currentDocument.title }]
      : [];
    const referencedByText = documents
      .filter((doc) => text.includes(`@${doc.title}`))
      .map((doc) => ({ type: "document" as const, id: doc.id, title: doc.title }));
    const referencedBrainsByText = brainKnowledges
      .filter((item) => text.includes(`#${item.title}`))
      .map((item) => ({ type: "brain" as const, id: item.id, title: item.title }));
    const requestReferences = uniqueReferences([...currentReference, ...references, ...referencedByText, ...brainReferences, ...referencedBrainsByText]);

    const userMsg: Message = { role: "user", content: text };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setReferences([]);
    setBrainReferences([]);
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

    try {
      const memoryContext = buildMemoryContext(memory);
      let fullContent = "";
      let firstDelta = true;

      const { reply, action } = await streamChat(
        { messages: withUser, personality: personalityRef.current, memoryContext, references: requestReferences },
        (delta) => {
          fullContent += delta;
          // Detect action markers in streaming content to switch indicator
          if (/<<ACTION_JSON>>|<<DOC_BEGIN>>|<<UPDATE_DOC:/.test(fullContent)) {
            setIsActing(true);
          }
          if (firstDelta) {
            firstDelta = false;
            setStreaming(true);
            setMessages((prev) => [...prev, { role: "assistant", content: delta, sources: requestReferences }]);
          } else {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: fullContent, sources: requestReferences };
              }
              return next;
            });
          }
        },
        abort.signal
      );

      // Determine final acting state from parsed action
      const hasAction = !!(action && (action.type === "create_document" || action.type === "update_document"));
      setIsActing(hasAction);

      // Finalize with parsed reply
      const finalContent = reply || fullContent;

      // Always show reply in chat (parseAction already strips doc content from reply)
      if (!finalContent.trim()) {
        throw new Error(t("ai.emptyReply"));
      }
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: finalContent, sources: requestReferences };
        } else if (finalContent) {
          next.push({ role: "assistant", content: finalContent, sources: requestReferences });
        }
        return next;
      });
      memoryRef.current = [...memory, { role: "assistant", content: finalContent }];
      saveMemory(memoryRef.current);

      // Handle create_document action: create doc in background
      if (action?.type === "create_document") {
        try {
          const nextContent = typeof action.content === "string" ? action.content.trim() : "";
          if (!nextContent) {
            toast(t("ai.menu.emptyResult"), "error");
            return;
          }

          const title = typeof action.title === "string" && action.title.trim() ? action.title.trim() : t("editor.untitled");
          const docId = await createDocument("general", title, markdownToHtml(nextContent));
          // Append a system note to memory so the model knows what was created in follow-up turns
          const docNote = { role: "assistant" as const, content: `[系统] 已为用户创建文档「${title}」[doc:${docId}]。内容摘要：${nextContent.slice(0, 200)}...` };
          memoryRef.current = [...memoryRef.current, docNote];
          saveMemory(memoryRef.current);
        } catch {
          toast(t("ai.docCreateFailed"), "error");
        }
      }

      // Handle update_document action: update the document specified by the model
      if (action?.type === "update_document" && action.content) {
        try {
          const nextContent = typeof action.content === "string" ? action.content.trim() : "";
          if (!nextContent) {
            toast(t("ai.docUpdateEmpty"), "error");
            return;
          }

          const actionDocId = typeof action.docId === "string" ? action.docId.trim() : "";
          const docReferences = requestReferences.filter((ref): ref is DocumentReference => ref.type === "document");
          const fallbackDocId = docReferences.length === 1 ? docReferences[0].id : "";
          const targetDocId = actionDocId && getDocument(actionDocId) ? actionDocId : fallbackDocId || actionDocId;
          const targetDoc = targetDocId ? getDocument(targetDocId) || await loadDocument(targetDocId) : null;

          if (!targetDoc) {
            const message = t("ai.docUpdateTargetMissing");
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: message };
              } else {
                next.push({ role: "assistant", content: message });
              }
              return next;
            });
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
            nextMarkdown: nextContent,
            nextHtml,
            diffLines,
            stats,
          });
          setTaskStage("preview");
          toast(t("ai.diffReady"), "info");
        } catch (err: any) {
          console.error("[update_doc] error:", err);
          toast(t("ai.docUpdateFailed"), "error");
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") return;
      // Remove thinking indicator and show error
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          next[next.length - 1] = { role: "assistant", content: error.message || "AI 服务不可用" };
        } else {
          next.push({ role: "assistant", content: error.message || t("ai.serviceUnavailable") });
        }
        return next;
      });
    } finally {
      setLoading(false);
      setStreaming(false);
      setIsActing(false);
      setTaskStage((stage) => (stage === "preview" ? stage : "idle"));
    }
  }, [input, loading, streaming, messages, currentDocumentId, createDocument, toast, t, documents, references, brainReferences, brainKnowledges, getDocument, loadDocument, updateDocument]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setStreaming(false);
    setIsActing(false);
  }, []);

  const applyPendingUpdate = useCallback(async () => {
    if (!pendingUpdate || applyingUpdate) return;
    const update = pendingUpdate; // 缓存当前值，避免中途关闭弹窗后被清空
    setApplyingUpdate(true);
    try {
      try {
        setTaskStage("snapshot");
        await createDocumentVersion(update.docId, "ai_edit");
      } catch (err) {
        console.error("[version_snapshot] error:", err);
        toast(t("ai.versionSnapshotFailed"), "error");
        return;
      }

      await updateDocument(update.docId, {
        title: update.title,
        content: update.nextHtml,
      });
      setTaskStage("verify");
      const verifiedDoc = await loadDocument(update.docId);
      if (!verifiedDoc || verifiedDoc.content !== update.nextHtml) {
        toast(t("ai.docUpdateVerifyFailed"), "error");
        return;
      }

      toast(t("ai.docUpdated"), "success");
      const updatedNote = {
        role: "assistant" as const,
        content: `[系统] 已为用户更新文档「${update.title}」[doc:${update.docId}]。最新内容摘要：${update.nextMarkdown.slice(0, 200)}...`,
      };
      memoryRef.current = [...memoryRef.current, updatedNote];
      saveMemory(memoryRef.current);
      setPendingUpdate(null);
      setTaskStage("done");
    } catch (err: any) {
      console.error("[apply_update] error:", err);
      toast(t("ai.docUpdateFailed"), "error");
    } finally {
      setApplyingUpdate(false);
      setTimeout(() => setTaskStage("idle"), 1200);
    }
  }, [applyingUpdate, createDocumentVersion, loadDocument, pendingUpdate, t, toast, updateDocument]);

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
      await restoreDocumentVersion(currentDocumentId, version.id);
      toast(t("ai.versionRestored"), "success");
      await loadVersions();
    } catch (err) {
      console.error("[versions] restore error:", err);
      toast(t("ai.versionRestoreFailed"), "error");
    } finally {
      setRestoringVersionId(null);
    }
  }, [currentDocumentId, loadVersions, restoreDocumentVersion, restoringVersionId, t, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Backspace" || e.key === "Delete") && (references.length > 0 || brainReferences.length > 0)) {
      const target = e.currentTarget as HTMLTextAreaElement;
      const selectionStart = target.selectionStart ?? 0;
      const selectionEnd = target.selectionEnd ?? selectionStart;
      if (selectionStart === selectionEnd) {
        const docRange = findTokenDeletionRange(input, selectionStart, e.key, references, "@");
        const brainRange = findTokenDeletionRange(input, selectionStart, e.key, brainReferences, "#");
        const range = docRange || brainRange;
        if (range) {
          e.preventDefault();
          const next = `${input.slice(0, range.start)}${input.slice(range.end)}`;
          setInput(next);
          setMentionOpen(false);
          setBrainOpen(false);
          setMentionIndex(0);
          setReferences((prev) => prev.filter((ref) => next.includes(`@${ref.title}`)));
          setBrainReferences((prev) => prev.filter((ref) => next.includes(`#${ref.title}`)));
          requestAnimationFrame(() => {
            inputRef.current?.setSelectionRange(range.start, range.start);
            resizeTextarea();
          });
          return;
        }
      }
    }

    if (showCommandMenu) {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandOpen(false);
        return;
      }
      if (commandMatches.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCommandIndex((i) => Math.min(i + 1, commandMatches.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setCommandIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectCommand(commandMatches[commandIndex]);
          return;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        return;
      }
    }

    if (showBrainMenu) {
      if (e.key === "Escape") {
        e.preventDefault();
        setBrainOpen(false);
        return;
      }
      if (brainMatches.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setBrainIndex((i) => Math.min(i + 1, brainMatches.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setBrainIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectBrainReference(brainMatches[brainIndex]);
          return;
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        return;
      }
    }

    // When mention menu is open, intercept all navigation keys
    if (showMentionMenu) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
      if (mentionMatches.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMentionIndex((i) => Math.min(i + 1, mentionMatches.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          selectReference(mentionMatches[mentionIndex]);
          return;
        }
      } else if (e.key === "Enter") {
        // Block Enter when mention menu is open but no matches
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentPersonality = PERSONALITY_OPTIONS.find((p) => p.key === personality) || PERSONALITY_OPTIONS[0];
  const isGenerating = loading || streaming;
  const mention = getMentionQuery(input);
  const brainMention = getBrainQuery(input);
  const slash = getSlashQuery(input);
  const slashCommands: SlashCommand[] = [
    { id: "rewrite", label: t("ai.commandRewrite"), prompt: t("ai.commandRewritePrompt") },
    { id: "summarize", label: t("ai.commandSummarize"), prompt: t("ai.commandSummarizePrompt") },
    { id: "expand", label: t("ai.commandExpand"), prompt: t("ai.commandExpandPrompt") },
    { id: "formal", label: t("ai.commandFormal"), prompt: t("ai.commandFormalPrompt") },
    { id: "outline", label: t("ai.commandOutline"), prompt: t("ai.commandOutlinePrompt") },
    { id: "docqa", label: t("ai.commandDocQA"), prompt: t("ai.commandDocQAPrompt") },
    { id: "multisummary", label: t("ai.commandMultiSummary"), prompt: t("ai.commandMultiSummaryPrompt") },
  ];
  const commandMatches = slash
    ? slashCommands.filter((command) => command.label.toLowerCase().includes(slash.query.toLowerCase()))
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

  const selectCommand = (command: SlashCommand) => {
    if (!slash) return;
    setInput((prev) => `${prev.slice(0, slash.start)}${command.prompt}`);
    setCommandOpen(false);
    setCommandIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      resizeTextarea();
    });
  };

  const handleInputChange = (next: string) => {
    setInput(next);
    const nextMention = getMentionQuery(next);
    const nextBrain = getBrainQuery(next);
    const nextSlash = getSlashQuery(next);
    setMentionOpen(!!nextMention);
    setBrainOpen(!!nextBrain && !nextMention);
    setCommandOpen(!!nextSlash && !nextMention && !nextBrain);
    setMentionIndex(0);
    setBrainIndex(0);
    setCommandIndex(0);
    setReferences((prev) => prev.filter((ref) => next.includes(`@${ref.title}`)));
    setBrainReferences((prev) => prev.filter((ref) => next.includes(`#${ref.title}`)));
  };

  return (
    <>
      {/* Floating button */}
      <button
        onMouseDown={handleMouseDown}
        aria-label={t("ai.title")}
        className={cn(
          "group fixed z-50 flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(232,237,233,0.92))] shadow-[0_18px_38px_rgba(46,61,57,0.18),inset_0_1px_0_rgba(255,255,255,0.92)] ring-1 ring-surface-200/70 transition-all duration-300 select-none backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(47,55,52,0.96),rgba(24,32,30,0.92))] dark:ring-white/10",
          open ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100",
          dragging ? "cursor-grabbing scale-105" : "cursor-grab hover:-translate-y-0.5 hover:scale-105",
          "text-surface-700 dark:text-surface-100"
        )}
        style={{ left: pos.x, top: pos.y, transition: dragging ? "none" : undefined }}
      >
        <span className="absolute inset-[5px] rounded-full bg-[radial-gradient(circle_at_33%_22%,rgba(255,255,255,0.88),rgba(255,255,255,0)_34%),linear-gradient(145deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08)_58%,rgba(185,149,78,0.14))] shadow-[inset_0_-10px_18px_rgba(92,107,102,0.08)] dark:bg-[radial-gradient(circle_at_35%_22%,rgba(255,255,255,0.22),rgba(255,255,255,0)_32%),linear-gradient(145deg,rgba(255,255,255,0.12),rgba(185,149,78,0.12))]" />
        <span className="absolute -right-4 -top-4 h-11 w-11 rounded-full bg-brand-200/35 blur-xl transition-transform duration-500 group-hover:translate-x-1 group-hover:translate-y-1 dark:bg-brand-500/20" />
        <svg
          viewBox="0 0 80 80"
          aria-hidden="true"
          className="relative h-12 w-12 drop-shadow-[0_5px_10px_rgba(46,61,57,0.22)]"
        >
          <path
            d="M18.7 45.2c-3.4-12.2 4.2-24.8 17-28.1 11.7-3 23.6 3.9 26.6 15.4 2.9 11.2-3.8 22.8-15.3 26.5-5.2 1.7-10.6 1.3-15.1-.8L20.8 63l3.1-10.2a22.6 22.6 0 0 1-5.2-7.6Z"
            fill="rgba(255,255,255,0.54)"
            stroke="rgba(101,118,112,0.64)"
            strokeLinejoin="round"
            strokeWidth="2.7"
          />
          <path
            d="M31.6 48.3c7.2-15.7 17.1-25.8 31.6-30.2-3.2 15.1-11.7 26.2-27.4 34.7l-9.4 5.1 5.2-9.6Z"
            fill="rgba(255,255,255,0.72)"
            stroke="rgba(82,98,93,0.92)"
            strokeLinejoin="round"
            strokeWidth="3.2"
          />
          <path
            d="M37.5 48.4 56.2 25"
            fill="none"
            stroke="rgba(82,98,93,0.74)"
            strokeLinecap="round"
            strokeWidth="2.4"
          />
          <path
            d="M31.2 47.9 19.4 59.7"
            fill="none"
            stroke="rgba(82,98,93,0.88)"
            strokeLinecap="round"
            strokeWidth="3.4"
          />
          <path
            d="M28.1 51.2 21 44l-2.6 15.2 15.1-2.7-5.4-5.3Z"
            fill="rgba(255,255,255,0.86)"
            stroke="rgba(82,98,93,0.9)"
            strokeLinejoin="round"
            strokeWidth="2.8"
          />
          <path
            d="M44.4 36.4h10.5M39.5 43.2h10.8"
            fill="none"
            stroke="rgba(185,149,78,0.72)"
            strokeLinecap="round"
            strokeWidth="2.4"
          />
          <circle cx="61.5" cy="20.2" r="4.1" fill="rgba(255,255,255,0.88)" />
          <circle cx="61.5" cy="20.2" r="2" fill="rgba(216,189,115,0.9)" />
        </svg>
      </button>

      {open && keyOk && (
        <div className="fixed bottom-6 left-6 z-50 flex h-[min(760px,calc(100vh-48px))] w-[min(560px,calc(100vw-48px))] flex-col rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900">
          {/* Backdrop: click outside to close and abort */}
          <div
            className="fixed inset-0 -z-10"
            onClick={() => {
              if (abortRef.current) {
                abortRef.current.abort();
              }
              saveConversation();
              setOpen(false);
            }}
          />
          {/* Header */}
          <div className="shrink-0 border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
                  <Bot className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{t("ai.title")}</h3>
                  <p className="text-[10px] text-surface-500">小麦 · {currentPersonality.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {currentDocumentId && (
                  <Tooltip content={t("ai.versionHistory")} delay={150}>
                    <Button variant="ghost" size="icon" onClick={() => setVersionDialogOpen(true)} className="h-8 w-8">
                      <History className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
                <Tooltip content={t("card.edit")} delay={150}>
                  <Button variant="ghost" size="icon" onClick={() => { setEditMode(!editMode); setSelectedMsgs(new Set()); }} className={cn("h-8 w-8", editMode && "bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-400")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content={t("ai.clearHistory")} delay={150}>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(true)} className="h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <Tooltip content={t("common.close")} delay={150}>
                  <Button variant="ghost" size="icon" onClick={() => { abortRef.current?.abort(); saveConversation(); setOpen(false); }} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </Tooltip>
              </div>
            </div>

            {/* Personality selector */}
            <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setPersonalityOpen(!personalityOpen)}
                className="flex items-center gap-1.5 rounded-lg border border-surface-200 bg-surface-50 px-2 py-1 text-xs text-surface-600 hover:bg-surface-100 transition-colors dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700"
              >
                <Smile className="h-3 w-3" />
                <span>{currentPersonality.emoji} {currentPersonality.label}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", personalityOpen && "rotate-180")} />
              </button>
              {personalityOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPersonalityOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 w-36 rounded-lg border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                    {PERSONALITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => changePersonality(opt.key)}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-surface-50 dark:hover:bg-surface-800",
                          personality === opt.key
                            ? "text-brand-600 font-medium bg-brand-50 dark:text-brand-400 dark:bg-brand-950"
                            : "text-surface-600 dark:text-surface-400"
                        )}
                      >
                        <span>{opt.emoji}</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {activeContextDocument && (
              <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-brand-100 bg-brand-50 px-2 py-1 text-xs text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
                <FileText className="h-3 w-3 shrink-0" />
                <span className="shrink-0 font-medium">{t("ai.currentContext")}</span>
                <span className="truncate">@{activeContextDocument.title}</span>
                <span className="shrink-0 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-900/70 dark:text-brand-200">
                  {t("ai.autoContext")}
                </span>
              </div>
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
          <Scrollbar className="flex-1 px-4 py-4" options={{ scrollbars: { autoHide: "leave" } }} events={{ scroll: handleScrollEvent }}>
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
                  return (
                    <div key={i} className={cn("mb-4 flex gap-2 items-start", isUser ? "flex-row-reverse" : "flex-row")}>
                      {/* Edit checkbox */}
                      {editMode && (
                        <button
                          onClick={() => {
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
                        </button>
                      )}
                      {/* Avatar */}
                      {isUser ? (
                        avatarUrl ? (
                          <img src={avatarUrl} alt="me" className="h-7 w-7 shrink-0 rounded-full object-cover mt-0.5" />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-white mt-0.5">
                            {initials}
                          </div>
                        )
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
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
                          <div
                            className="ai-chat-markdown prose prose-sm max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(msg.content)) }}
                          />
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
                                  ) : (
                                    <FileText className="h-3 w-3 shrink-0 text-brand-500" />
                                  )}
                                  <span className="truncate">{source.type === "brain" ? "#" : "@"}{source.title}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {streaming && isLastAssistant && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse rounded-sm align-middle" />
                        )}
                        {/* Feedback buttons: centered vertically, appear on hover */}
                        {!isUser && !streaming && msg.content && !feedbackDoneRef.current.has(i) && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-0.5">
                            <Tooltip content={t("ai.like")} delay={150} side="right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (showRating && feedbackMsgIdx === i) {
                                    setClosingRating(true);
                                    setTimeout(() => { setShowRating(false); setFeedbackMsgIdx(null); setClosingRating(false); }, 180);
                                  } else {
                                    setFeedbackMsgIdx(i); setShowRating(true); setShowDislikeOpts(false);
                                  }
                                }}
                                className="p-0.5 rounded text-surface-300 hover:text-amber-500 hover:bg-surface-100 transition-colors"
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </button>
                            </Tooltip>
                            <Tooltip content={t("ai.dislike")} delay={150} side="right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (showDislikeOpts && feedbackMsgIdx === i) {
                                    setClosingDislike(true);
                                    setTimeout(() => { setShowDislikeOpts(false); setFeedbackMsgIdx(null); setClosingDislike(false); }, 180);
                                  } else {
                                    setFeedbackMsgIdx(i); setShowDislikeOpts(true); setShowRating(false);
                                  }
                                }}
                                className="p-0.5 rounded text-surface-300 hover:text-red-500 hover:bg-surface-100 transition-colors"
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </button>
                            </Tooltip>
                            {/* Star rating popover */}
                            {showRating && feedbackMsgIdx === i && (
                              <div className={cn(
                                "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex items-center gap-0.5 bg-white border border-surface-200 rounded-lg px-1.5 py-1 shadow-sm dark:bg-surface-800 dark:border-surface-700 whitespace-nowrap",
                                closingRating ? "animate-out fade-out duration-150" : "animate-in fade-in duration-200"
                              )}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <button
                                    key={star}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await api.sendFeedback({ messageContent: msg.content, feedbackType: "like", rating: star });
                                      api.logActivity({ action: "chat_feedback", detail: `like:${star}` }).catch(() => {});
                                      toast(t("ai.feedbackThanks"), "success");
                                      feedbackDoneRef.current.add(i);
                                      setShowRating(false); setFeedbackMsgIdx(null);
                                    }}
                                    onMouseEnter={() => setHoverStar(star)}
                                    onMouseLeave={() => setHoverStar(0)}
                                    className="p-0.5 transition-transform hover:scale-125"
                                  >
                                    <Star
                                      className="h-3.5 w-3.5 transition-colors"
                                      fill={hoverStar >= star ? "currentColor" : "none"}
                                      color={hoverStar >= star ? "#f59e0b" : "#d1d5db"}
                                    />
                                  </button>
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
                                  <button
                                    key={reason}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      await api.sendFeedback({ messageContent: msg.content, feedbackType: "dislike", reason });
                                      api.logActivity({ action: "chat_feedback", detail: `dislike:${reason}` }).catch(() => {});
                                      toast(t("ai.feedbackThanks"), "success");
                                      feedbackDoneRef.current.add(i);
                                      setShowDislikeOpts(false); setFeedbackMsgIdx(null);
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded-full border border-surface-200 text-surface-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors dark:border-surface-700 dark:hover:bg-red-950"
                                  >
                                    {reason}
                                  </button>
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
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-100 px-4 py-3 dark:bg-surface-800">
                      <span className="text-xs text-surface-500">
                        {(isActing ? t("ai.action") : t("ai.thinking")).split("").map((char, ci) => (
                          <span
                            key={ci}
                            className="inline-block animate-bounce"
                            style={{ animationDelay: `${ci * 80}ms`, animationDuration: "0.6s" }}
                          >
                            {char === " " ? "\u00A0" : char}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={chatEndRef} />
          </Scrollbar>

          {/* Delete selected bar */}
          {editMode && selectedMsgs.size > 0 && (
            <div className="shrink-0 border-t border-surface-200 bg-red-50 px-4 py-2 flex items-center justify-between dark:bg-red-950 dark:border-surface-700">
              <span className="text-xs text-red-600 dark:text-red-400">已选择 {selectedMsgs.size} 条消息</span>
              <Button size="sm" variant="destructive" onClick={() => setDeleteMsgConfirm(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                删除
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-surface-200 px-3 py-3 dark:border-surface-700">
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
                    <button
                      type="button"
                      title={t("ai.removeReference")}
                      onClick={() => removeReference(ref)}
                      className="rounded-full p-0.5 text-brand-400 hover:bg-brand-100 hover:text-brand-700 dark:hover:bg-brand-900 dark:hover:text-brand-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {brainReferences.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-surface-400">{t("ai.brainContext")}</span>
                {brainReferences.map((ref) => (
                  <span
                    key={ref.id}
                    className="inline-flex max-w-[180px] items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  >
                    <Sparkles className="h-3 w-3 shrink-0" />
                    <span className="truncate">#{ref.title}</span>
                    <button
                      type="button"
                      title={t("ai.removeBrainReference")}
                      onClick={() => removeBrainReference(ref)}
                      className="rounded-full p-0.5 text-amber-400 hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900 dark:hover:text-amber-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-surface-200 bg-white p-2 shadow-sm transition-colors focus-within:border-brand-300 focus-within:ring-1 focus-within:ring-brand-300 dark:border-surface-700 dark:bg-surface-900 dark:focus-within:border-brand-700">
              <div className="relative flex items-end gap-2">
                <div className="relative min-w-0 flex-1">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isGenerating ? t("ai.replying") : t("ai.placeholder")}
                    disabled={isGenerating}
                    rows={1}
                    className="block min-h-[42px] w-full resize-none overflow-hidden rounded-xl bg-transparent px-3 py-2.5 text-sm leading-5 text-surface-900 outline-none placeholder:text-surface-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-surface-100 dark:placeholder:text-surface-500"
                    style={{ maxHeight: "112px" }}
                  />
              {showMentionMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-full overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                  {mentionMatches.length > 0 ? (
                    mentionMatches.map((doc, idx) => (
                      <button
                        key={doc.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setMentionIndex(idx)}
                        onClick={() => selectReference(doc)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          idx === mentionIndex
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                            : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                        <span className="truncate">@{doc.title}</span>
                      </button>
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
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setBrainIndex(idx)}
                        onClick={() => selectBrainReference(item)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                          idx === brainIndex
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                        )}
                      >
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span className="truncate">#{item.title}</span>
                        {item.category && <span className="ml-auto shrink-0 text-[10px] text-surface-400">{item.category}</span>}
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-surface-400">{t("ai.noMatchingBrain")}</div>
                  )}
                </div>
              )}
              {showCommandMenu && (
                <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-full overflow-hidden rounded-xl border border-surface-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
                  {commandMatches.map((command, idx) => (
                    <button
                      key={command.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setCommandIndex(idx)}
                      onClick={() => selectCommand(command)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                        idx === commandIndex
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                          : "text-surface-700 hover:bg-surface-50 dark:text-surface-200 dark:hover:bg-surface-800"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span className="font-medium">{command.label}</span>
                      <span className="min-w-0 truncate text-surface-400">{command.prompt}</span>
                    </button>
                  ))}
                </div>
              )}
                </div>
                {isGenerating ? (
                  <Tooltip content={t("ai.stop")} delay={150}>
                    <Button size="icon" onClick={handleStop} className="mb-0.5 h-9 w-9 shrink-0 rounded-xl bg-red-500 hover:bg-red-600">
                      <Square className="h-3.5 w-3.5 text-white" fill="white" />
                    </Button>
                  </Tooltip>
                ) : (
                  <Tooltip content={t("ai.send")} delay={150}>
                    <Button size="icon" onClick={handleSend} disabled={!input.trim()} className="mb-0.5 h-9 w-9 shrink-0 rounded-xl">
                      <Send className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-1 text-[10px] text-surface-400 dark:text-surface-500">
                <span>{t("ai.mentionHint")}</span>
                <span>{t("ai.brainHint")}</span>
                <span>{t("ai.commandHint")}</span>
              </div>
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
          <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden">
            <div className="grid shrink-0 grid-cols-[96px_1fr] border-b border-surface-200 bg-surface-50 text-xs font-semibold text-surface-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400">
              <div className="border-r border-surface-200 px-4 py-2 dark:border-surface-700">{t("ai.diffOld")} / {t("ai.diffNew")}</div>
              <div className="px-4 py-2">{pendingUpdate.stats.unchanged} {t("ai.diffUnchanged")}</div>
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
                  {t("common.loading")}
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
        title="删除消息"
        description={`确定要删除选中的 ${selectedMsgs.size} 条消息吗？此操作不可撤销。`}
        confirmLabel="删除"
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => {
          const indices = Array.from(selectedMsgs).sort((a, b) => b - a);
          const newMsgs = [...messages];
          indices.forEach((idx) => newMsgs.splice(idx, 1));
          setMessages(newMsgs);
          memoryRef.current = newMsgs;
          saveMemory(newMsgs);
          setSelectedMsgs(new Set());
          api.logActivity({ action: "chat_delete", detail: `deleted_${selectedMsgs.size}_msgs` }).catch(() => {});
          toast("消息已删除", "success");
          setDeleteMsgConfirm(false);
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
            await api.deleteConversations();
            setMessages([]);
            memoryRef.current = [];
            localStorage.removeItem(MEMORY_KEY);
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
