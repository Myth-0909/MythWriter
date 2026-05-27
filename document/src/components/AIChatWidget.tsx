import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, X, Send, Sparkles, Smile, ChevronDown, ThumbsUp, ThumbsDown, Star, Trash2, Check, Pencil, Mic, MicOff, Square } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { markdownToHtml } from "@/lib/markdown";

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

const MEMORY_KEY = "mythwriter_ai_memory";
const PERSONALITY_KEY = "mythwriter_ai_personality";
const MAX_MEMORY_MESSAGES = 20;

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Position {
  x: number;
  y: number;
}

function loadMemory(): Message[] {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || "[]"); } catch { return []; }
}

function saveMemory(messages: Message[]) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(messages.slice(-MAX_MEMORY_MESSAGES)));
}

function buildMemoryContext(memory: Message[]): string {
  if (memory.length === 0) return "";
  return memory.map((m) => {
    const role = m.role === "user" ? "用户" : "助手";
    return `${role}: ${m.content.slice(0, 200)}`;
  }).join("\n");
}

async function streamChat(
  data: { messages: Message[]; personality: string; memoryContext: string },
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
        if (e.message && !e.message.includes("JSON")) throw e;
      }
    }
  }

  // Fallback: if no done event received, use accumulated content
  if (!finalReply && fullContent) {
    finalReply = fullContent;
  }

  return { reply: finalReply, action: finalAction };
}

export function AIChatWidget() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { createDocument } = useDocuments();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
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
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [keyOk, setKeyOk] = useState(false);

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
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 16, y: window.innerHeight - 56 - 16 };
  });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // User avatar
  const avatarUrl = user?.avatar ? `http://localhost:3000/uploads/${user.avatar}` : null;
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  useEffect(() => {
    setPos({ x: 16, y: window.innerHeight - 80 });
  }, []);

  // Resize handler
  useEffect(() => {
    const updatePos = () => {
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

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        try { localStorage.setItem("chat-btn-pos", JSON.stringify(snapped)); } catch {}
      }
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
  }, [dragging, pos]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || streaming) return;

    const userMsg: Message = { role: "user", content: text };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setLoading(true);
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
        { messages: withUser, personality: personalityRef.current, memoryContext },
        (delta) => {
          fullContent += delta;
          if (firstDelta) {
            firstDelta = false;
            setStreaming(true);
            // Add assistant message on first delta
            setMessages((prev) => [...prev, { role: "assistant", content: delta }]);
          } else {
            // Update last assistant message
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = { ...last, content: fullContent };
              }
              return next;
            });
          }
        },
        abort.signal
      );

      // Finalize with parsed reply
      const finalContent = reply || fullContent;
      if (!finalContent.trim()) {
        throw new Error(t("ai.emptyReply"));
      }
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") {
          next[next.length - 1] = { ...last, content: finalContent };
        } else if (finalContent) {
          next.push({ role: "assistant", content: finalContent });
        }
        return next;
      });

      memoryRef.current = [...memory, { role: "assistant", content: finalContent }];
      saveMemory(memoryRef.current);

      if (action?.type === "create_document" && action.content) {
        try {
          await createDocument("general", action.title, markdownToHtml(action.content));
          toast(`${t("ai.docCreated")}: ${action.title}`, "success");
        } catch {
          toast(t("ai.docCreateFailed"), "error");
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
    }
  }, [input, loading, streaming, messages, createDocument, toast, t]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setStreaming(false);
  }, []);

  const toggleVoice = useCallback(async () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    // Request mic permission first (triggers OS permission dialog)
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        toast("请在系统设置中允许麦克风权限后重试", "error");
        return;
      }
    }

    if (!SpeechRecognition) {
      toast(t("ai.voiceNotSupported"), "error");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => prev + transcript);
      toast(t("ai.recognitionSuccess"), "success");
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        toast("请在系统设置中允许麦克风权限后重试", "error");
      } else if (event.error === "no-speech") {
        toast("未检测到语音，请重试", "info");
      } else {
        toast(`语音识别失败: ${event.error}`, "error");
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      toast(t("ai.voiceNotSupported"), "error");
      setListening(false);
    }
  }, [listening, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentPersonality = PERSONALITY_OPTIONS.find((p) => p.key === personality) || PERSONALITY_OPTIONS[0];
  const isGenerating = loading || streaming;

  return (
    <>
      {/* Floating button */}
      <button
        onMouseDown={handleMouseDown}
        className={cn(
          "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 select-none",
          open ? "opacity-0 pointer-events-none scale-75" : "opacity-100 scale-100",
          dragging ? "cursor-grabbing shadow-xl scale-105" : "cursor-grab hover:shadow-xl hover:scale-105",
          "bg-brand-500 text-white dark:bg-brand-600"
        )}
        style={{ left: pos.x, top: pos.y, transition: dragging ? "none" : undefined }}
      >
        <Sparkles className="h-6 w-6" />
      </button>

      {open && keyOk && (
        <div className="fixed bottom-6 left-6 z-50 flex h-[640px] w-[480px] flex-col rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900">
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
                <Button variant="ghost" size="icon" onClick={() => { setEditMode(!editMode); setSelectedMsgs(new Set()); }} className={cn("h-8 w-8", editMode && "bg-brand-100 text-brand-600 dark:bg-brand-900 dark:text-brand-400")} title="编辑">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(true)} className="h-8 w-8" title={t("ai.clearHistory")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => { abortRef.current?.abort(); saveConversation(); setOpen(false); }} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Personality selector */}
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
          </div>

          {/* Messages */}
          <Scrollbar className="flex-1 px-4 py-4" options={{ scrollbars: { autoHide: "leave" } }}>
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
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap relative",
                        isUser
                          ? "bg-brand-500 text-white rounded-br-md"
                          : "bg-surface-100 text-surface-800 rounded-bl-md dark:bg-surface-800 dark:text-surface-200 group"
                      )}>
                        {msg.content}
                        {streaming && isLastAssistant && (
                          <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse rounded-sm align-middle" />
                        )}
                        {/* Feedback buttons: centered vertically, appear on hover */}
                        {!isUser && !streaming && msg.content && !feedbackDoneRef.current.has(i) && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col gap-0.5">
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
                              title={t("ai.like")}
                            >
                              <ThumbsUp className="h-3 w-3" />
                            </button>
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
                              title={t("ai.dislike")}
                            >
                              <ThumbsDown className="h-3 w-3" />
                            </button>
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
                {/* Thinking indicator */}
                {loading && !streaming && (
                  <div className="mb-4 flex gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900 mt-0.5">
                      <Bot className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-surface-100 px-4 py-3 dark:bg-surface-800">
                      <span className="text-xs text-surface-500">
                        {t("ai.thinking").split("").map((char, ci) => (
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

          {/* Recording indicator */}
          {listening && (
            <div className="shrink-0 mx-3 mt-2 flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 dark:bg-red-950 dark:border-red-800 animate-in fade-in slide-in-from-bottom-2 duration-200">
              {/* Red dot + text */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
                <span className="text-sm font-medium text-red-600 dark:text-red-400">{t("ai.recording")}</span>
              </div>
              {/* Waveform bars */}
              <div className="flex items-center gap-[2px] h-6 flex-1 justify-center">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-red-400 recording-bar"
                    style={{ animationDelay: `${i * 0.1}s`, animationDuration: `${0.6 + Math.random() * 0.4}s` }}
                  />
                ))}
              </div>
              <span className="text-xs text-red-400 dark:text-red-500 shrink-0">{t("ai.tapToStop")}</span>
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 border-t border-surface-200 px-3 py-3 dark:border-surface-700">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isGenerating ? t("ai.replying") : t("ai.placeholder")}
                disabled={isGenerating}
                className="flex-1 rounded-xl border border-surface-200 bg-surface-50 px-4 py-2 text-sm text-surface-900 outline-none transition-all duration-200 hover:border-surface-300 hover:bg-surface-100 focus:border-brand-300 focus:ring-1 focus:ring-brand-300 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 dark:hover:border-surface-600 dark:hover:bg-surface-700 dark:focus:border-brand-700 dark:focus:bg-surface-800"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleVoice}
                disabled={isGenerating}
                className={cn(
                  "h-9 w-9 shrink-0 rounded-xl transition-colors",
                  listening
                    ? "text-red-500 bg-red-50 hover:bg-red-100 animate-pulse"
                    : "text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800"
                )}
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              {isGenerating ? (
                <Button size="icon" onClick={handleStop} className="h-9 w-9 shrink-0 rounded-xl bg-red-500 hover:bg-red-600">
                  <Square className="h-3.5 w-3.5 text-white" fill="white" />
                </Button>
              ) : (
                <Button size="icon" onClick={handleSend} disabled={!input.trim()} className="h-9 w-9 shrink-0 rounded-xl">
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
