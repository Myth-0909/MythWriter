import { useState, useCallback } from "react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bot, ChevronDown, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";

const API_BASE = "http://localhost:3000/api";

type ActionType = "rewrite" | "expand" | "summarize" | "translate" | "continue" | "toneFormal" | "toneCasual";

const ACTION_PROMPTS: Record<ActionType, string> = {
  rewrite: "改写",
  expand: "扩写",
  summarize: "缩写",
  translate: "翻译为{targetLang}",
  continue: "续写",
  toneFormal: "用正式语气改写",
  toneCasual: "用轻松语气改写",
};

async function streamChat(
  data: { messages: { role: string; content: string }[]; personality: string; purpose?: "selection_edit" },
  onDelta: (delta: string) => void,
  signal: AbortSignal
): Promise<string> {
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
        if (parsed.delta) {
          fullContent += parsed.delta;
          onDelta(parsed.delta);
        }
        if (parsed.done) finalReply = parsed.reply;
      } catch (e: any) {
        if (e.message && !e.message.includes("JSON")) throw e;
      }
    }
  }
  if (!finalReply && fullContent) finalReply = fullContent;
  return finalReply;
}

interface AIBubbleMenuProps {
  editor: Editor;
}

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const handleAction = useCallback(async (type: ActionType) => {
    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;

    let prompt = ACTION_PROMPTS[type];
    if (type === "translate") {
      prompt = prompt.replace("{targetLang}", lang === "zh" ? "英文" : "中文");
    }

    const systemMessage = `你是一个写作助手。用户选中了以下文字，请执行【${prompt}】操作。只返回结果，不要添加任何解释或额外文字。

选中的文字：${selectedText}`;

    setLoading(true);
    setShowMore(false);

    let accumulated = "";
    const controller = new AbortController();

    try {
      const reply = await streamChat(
        { messages: [{ role: "user", content: systemMessage }], personality: "normal", purpose: "selection_edit" },
        (delta) => {
          accumulated += delta;
        },
        controller.signal
      );

      const result = (reply || accumulated).trim();
      if (!result) throw new Error(t("ai.menu.emptyResult"));

      if (type === "continue") {
        editor.chain().focus().insertContentAt(to, result).run();
      } else {
        editor.chain().focus().insertContentAt({ from, to }, result).run();
      }
      toast(t("ai.menu.applied"), "success");
    } catch (err: any) {
      console.error("AI action failed:", err);
      toast(`${t("ai.menu.failed")}: ${err.message || "unknown"}`, "error");
    } finally {
      setLoading(false);
    }
  }, [editor, lang, t, toast]);

  const primaryActions: ActionType[] = ["rewrite", "expand", "summarize", "translate"];
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
      <div className="flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-1.5 py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900">
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
