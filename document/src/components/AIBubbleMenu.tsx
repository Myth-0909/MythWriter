import { useState, useCallback, useRef } from "react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bot, ChevronDown, Sparkles, Square } from "lucide-react";
import { InlineLoading } from "@/components/LoadingSpinner";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { API_BASE } from "@/lib/apiBase";
import { toApiMessages } from "@/lib/aiChatApiMessages";

function safePersonality(raw: string | null): string {
  const valid = ["normal", "cute", "catgirl", "serious", "silly"];
  return raw && valid.includes(raw) ? raw : "normal";
}

function cleanSelectionResult(text: string): string {
  let result = text
    .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .trim();
  const firstLine = result.split("\n")[0].trim();
  if (firstLine) return result;
  const lines = result.split("\n");
  for (const line of lines) {
    if (line.trim()) return line.trim();
  }
  return result;
}

type ActionType = "rewrite" | "expand" | "summarize" | "continue" | "toneFormal" | "toneCasual";

const ACTION_PROMPTS: Record<ActionType, string> = {
  rewrite: "改写",
  expand: "扩写",
  summarize: "缩写",
  continue: "续写",
  toneFormal: "用正式语气改写",
  toneCasual: "用轻松语气改写",
};

interface AIBubbleMenuProps {
  editor: Editor;
  documentId?: string;
}

export function AIBubbleMenu({ editor, documentId }: AIBubbleMenuProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [showMore, setShowMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const personality = safePersonality(localStorage.getItem("ai-personality"));

  const streamChat = useCallback(async (
    messages: { role: string; content: string }[],
    references: { type: string; id: string; selectedText?: string }[] | undefined,
    onDelta: (delta: string) => void,
    signal: AbortSignal
  ): Promise<string> => {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: toApiMessages(messages),
        personality,
        memoryContext: "",
        purpose: "selection_edit",
        references,
      }),
      signal,
    });

    const ct = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (ct.includes("application/json")) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (ct.includes("application/json")) {
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json.reply || "";
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let finalReply = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.delta) { fullContent += parsed.delta; onDelta(parsed.delta); }
          if (parsed.done) finalReply = parsed.reply;
        } catch (e: any) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }
    if (!finalReply && fullContent) finalReply = fullContent;
    return finalReply;
  }, [personality]);

  const handleAction = useCallback(async (type: ActionType) => {
    if (loading) return;

    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;

    const prompt = ACTION_PROMPTS[type];
    const userMessage = `请对以下选中的文字执行【${prompt}】操作：\n\n${selectedText}`;

    setLoading(true);
    setActiveAction(type);
    setShowMore(false);

    let accumulated = "";
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const references = documentId
        ? [{ type: "document" as const, id: documentId, selectedText }]
        : [];

      const reply = await streamChat(
        [{ role: "user", content: userMessage }],
        references,
        (delta) => { accumulated += delta; },
        controller.signal
      );

      const result = cleanSelectionResult((reply || accumulated).trim());
      if (!result) throw new Error(t("ai.menu.emptyResult"));

      if (type === "continue") {
        editor.chain().focus().insertContentAt(to, result).run();
      } else {
        editor.chain().focus().insertContentAt({ from, to }, result).run();
      }
      toast(t("ai.menu.applied"), "success");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("AI action failed:", err);
      toast(`${t("ai.menu.failed")}: ${err.message || "unknown"}`, "error");
    } finally {
      setLoading(false);
      setActiveAction(null);
      abortRef.current = null;
    }
  }, [editor, loading, t, toast, streamChat]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setActiveAction(null);
  }, []);

  const primaryActions: ActionType[] = ["rewrite", "expand", "summarize"];
  const moreActions: ActionType[] = ["continue", "toneFormal", "toneCasual"];

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      shouldShow={({ editor: ed }) => {
        const { from, to } = ed.state.selection;
        if (from === to) return false;
        const text = ed.state.doc.textBetween(from, to, "\n");
        return text.trim().length > 0;
      }}
    >
      <div
        className="relative flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-1.5 py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900"
        aria-busy={loading}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-lg bg-white/90 px-3 backdrop-blur-[2px] dark:bg-surface-900/90">
            <InlineLoading
              variant="ai"
              size="sm"
              className="text-brand-600 dark:text-brand-300"
              label={activeAction ? `${t(`ai.menu.${activeAction}`)} · ${t("ai.menu.loading")}` : t("ai.menu.loading")}
            />
            <button
              type="button"
              onClick={handleCancel}
              className="ml-1 rounded p-0.5 text-surface-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title={t("common.cancel")}
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
        )}
        <Bot className="mr-1 h-3.5 w-3.5 text-brand-500" />
        {primaryActions.map((action) => (
          <button
            key={action}
            disabled={loading}
            onClick={() => handleAction(action)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-surface-700 hover:bg-surface-100 disabled:opacity-50 dark:text-surface-300 dark:hover:bg-surface-800"
            title={t(`ai.menu.${action}`)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>{t(`ai.menu.${action}`)}</span>
          </button>
        ))}
        <div className="relative">
          <button
            disabled={loading}
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-surface-500 hover:bg-surface-100 disabled:opacity-50 dark:text-surface-400 dark:hover:bg-surface-800"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`} />
          </button>
          {showMore && (
            <div className="absolute top-full left-0 mt-1 z-50 flex flex-col gap-0.5 rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-900 min-w-[100px]">
              {moreActions.map((action) => (
                <button
                  key={action}
                  disabled={loading}
                  onClick={() => { handleAction(action); setShowMore(false); }}
                  className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-left text-surface-700 hover:bg-surface-100 disabled:opacity-50 dark:text-surface-300 dark:hover:bg-surface-800"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{t(`ai.menu.${action}`)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </BubbleMenu>
  );
}
