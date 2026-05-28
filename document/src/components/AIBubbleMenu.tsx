import { useState, useCallback } from "react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bot, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";

const API_BASE = "http://localhost:3000/api";

function cleanSelectionResult(text: string): string {
  let result = text
    .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .trim();

  const firstLine = result.split("\n")[0].trim();
  if (firstLine) {
    return result;
  }

  const lines = result.split("\n");
  for (const line of lines) {
    if (line.trim()) {
      return line.trim();
    }
  }
  return result;
}

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
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [showMore, setShowMore] = useState(false);

  const handleAction = useCallback(async (type: ActionType) => {
    if (loading) return;

    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;

    // Grab 400 characters of context before and after the selection to guide the AI
    const precedingText = editor.state.doc.textBetween(Math.max(0, from - 400), from, "\n");
    const succeedingText = editor.state.doc.textBetween(to, Math.min(editor.state.doc.content.size, to + 400), "\n");

    let prompt = ACTION_PROMPTS[type];
    if (type === "translate") {
      prompt = prompt.replace("{targetLang}", lang === "zh" ? "英文" : "中文");
    }

    const systemMessage = `你是一个写作助手。当前用户正在撰写一篇文章，以下是文章的上下文信息，请特别参考上下文以确保语境、人设、语气和逻辑的一致性。

【前文内容（仅作背景参考，请勿在此基础上重复或修改）】
${precedingText}

【选中的文字（需要你执行 ${prompt} 的主体）】
>>> ${selectedText} <<<

【后文内容（仅作背景参考，请勿在此基础上重复或修改）】
${succeedingText}

【重要任务指令】
请仅对【选中的文字】（即被 >>> <<< 包裹的文本）执行【${prompt}】操作。
你输出的回答必须只包含处理后的文本结果，严禁包含任何解释、分析、Markdown 标记（如“以下是改写后的内容”等）或前后的引言。`;

    setLoading(true);
    setActiveAction(type);
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

      const result = cleanSelectionResult((reply || accumulated).trim());
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
      setActiveAction(null);
    }
  }, [editor, lang, loading, t, toast]);

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
      <div
        className="relative flex items-center gap-1 rounded-lg border border-surface-200 bg-white px-1.5 py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900"
        aria-busy={loading}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/90 px-3 backdrop-blur-[2px] dark:bg-surface-900/90">
            <div className="flex items-center gap-2 text-xs font-medium text-brand-600 dark:text-brand-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                {activeAction ? `${t(`ai.menu.${activeAction}`)} · ${t("ai.menu.loading")}` : t("ai.menu.loading")}
              </span>
            </div>
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
