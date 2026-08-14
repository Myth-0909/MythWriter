import { useState, useCallback, useEffect, useRef } from "react";
import { type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bot, Check, ChevronDown, Sparkles, Square, X } from "lucide-react";
import { InlineLoading } from "@/components/LoadingSpinner";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isSelectionEditContextCurrent,
  isSelectionSnapshotCurrent,
  plainTextToEditorHtml,
} from "@/lib/aiSelectionEdit";
import { streamChat } from "@/lib/aiChatClient";
import { api } from "@/api";
import { openAiModelConfig, resolveAiReadiness } from "@/lib/aiReadiness";

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

type PendingPreview = {
  from: number;
  to: number;
  original: string;
  result: string;
  actionType: ActionType;
  documentId?: string;
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
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const actionRunIdRef = useRef(0);
  const documentIdRef = useRef(documentId);
  const pendingPreviewRef = useRef<PendingPreview | null>(null);
  documentIdRef.current = documentId;
  pendingPreviewRef.current = pendingPreview;

  useEffect(() => {
    actionRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActiveAction(null);
    setPendingPreview(null);
  }, [documentId]);

  useEffect(() => () => {
    actionRunIdRef.current += 1;
    abortRef.current?.abort();
  }, []);

  const personality = safePersonality(
    localStorage.getItem("znwriter_ai_personality") || localStorage.getItem("ai-personality")
  );

  const handleAction = useCallback(async (type: ActionType) => {
    if (loading || pendingPreview) return;

    const { from, to } = editor.state.selection;
    if (from === to) return;

    const selectedText = editor.state.doc.textBetween(from, to, "\n");
    if (!selectedText.trim()) return;
    if (selectedText.length > 12_000) {
      toast(t("ai.menu.selectionTooLong"), "info");
      return;
    }

    const promptLabels: Record<ActionType, string> = {
      rewrite: t("ai.menu.rewrite"),
      expand: t("ai.menu.expand"),
      summarize: t("ai.menu.summarize"),
      continue: t("ai.menu.continue"),
      toneFormal: t("ai.menu.toneFormal"),
      toneCasual: t("ai.menu.toneCasual"),
    };
    const prompt = promptLabels[type];
    const userMessage = t("ai.menu.selectionPrompt")
      .replace("{action}", prompt)
      .replace("{text}", selectedText);

    const actionDocumentId = documentIdRef.current;
    const runId = actionRunIdRef.current + 1;
    actionRunIdRef.current = runId;
    setLoading(true);
    setActiveAction(type);

    let accumulated = "";
    let controller: AbortController | null = null;

    try {
      const readiness = await resolveAiReadiness(() => api.getApiKey());
      if (actionRunIdRef.current !== runId) return;
      if (readiness !== "ready") {
        toast(t(readiness === "missing" ? "ai.configRequiredTitle" : "ai.configCheckFailedTitle"), "error");
        if (readiness === "missing") openAiModelConfig();
        return;
      }

      const currentSelection = editor.state.selection;
      const contextStillCurrent = isSelectionEditContextCurrent({
        expectedDocumentId: actionDocumentId,
        currentDocumentId: documentIdRef.current,
        expectedFrom: from,
        expectedTo: to,
        currentFrom: currentSelection.from,
        currentTo: currentSelection.to,
        originalText: selectedText,
        currentText: editor.state.doc.textBetween(from, to, "\n"),
      });
      if (!contextStillCurrent) {
        toast(t("ai.menu.contextChanged"), "error");
        return;
      }

      controller = new AbortController();
      abortRef.current = controller;
      const references = actionDocumentId
        ? [{ type: "document" as const, id: actionDocumentId, selectedText }]
        : [];

      const response = await streamChat(
        {
          messages: [{ role: "user", content: userMessage }],
          personality,
          memoryContext: "",
          purpose: "selection_edit",
          references,
        },
        (delta) => { accumulated += delta; },
        () => {},
        () => {},
        controller.signal
      );
      if (actionRunIdRef.current !== runId) return;

      const result = cleanSelectionResult((response.reply || accumulated).trim());
      if (!result) throw new Error(t("ai.menu.emptyResult"));

      // Keep the original selection so BubbleMenu stays anchored for accept/reject.
      editor.chain().focus().setTextSelection({ from, to }).run();
      setPendingPreview({
        from,
        to,
        original: selectedText,
        result,
        actionType: type,
        documentId: actionDocumentId,
      });
    } catch (err: any) {
      if (actionRunIdRef.current !== runId) return;
      if (err?.name === "AbortError") return;
      console.error("AI action failed:", err);
      toast(t("ai.menu.failed"), "error");
    } finally {
      if (actionRunIdRef.current === runId) {
        setLoading(false);
        setActiveAction(null);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }, [editor, loading, pendingPreview, personality, t, toast]);

  const handleCancel = useCallback(() => {
    actionRunIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setActiveAction(null);
  }, []);

  const handleAccept = useCallback(() => {
    const preview = pendingPreviewRef.current;
    if (!preview) return;
    const { from, to, original, result, actionType } = preview;
    if (preview.documentId !== documentIdRef.current) {
      setPendingPreview(null);
      toast(t("ai.menu.contextChanged"), "error");
      return;
    }
    const maxPosition = editor.state.doc.content.size;
    const currentText = from >= 0 && to <= maxPosition && from <= to
      ? editor.state.doc.textBetween(from, to, "\n")
      : "";
    if (!isSelectionSnapshotCurrent(currentText, original)) {
      setPendingPreview(null);
      toast(t("ai.menu.selectionChanged"), "error");
      return;
    }
    const safeResult = plainTextToEditorHtml(result);
    const applied = actionType === "continue"
      ? editor.chain().focus().insertContentAt(to, safeResult).run()
      : editor.chain().focus().insertContentAt({ from, to }, safeResult).run();
    if (!applied) {
      toast(t("ai.menu.failed"), "error");
      return;
    }
    setPendingPreview(null);
    toast(t("ai.menu.applied"), "success");
  }, [editor, t, toast]);

  const handleReject = useCallback(() => {
    const preview = pendingPreviewRef.current;
    if (preview) {
      editor.chain().focus().setTextSelection({ from: preview.from, to: preview.to }).run();
    }
    setPendingPreview(null);
    toast(t("ai.menu.rejected"), "info");
  }, [editor, t, toast]);

  const primaryActions: ActionType[] = ["rewrite", "expand", "summarize"];
  const moreActions: ActionType[] = ["continue", "toneFormal", "toneCasual"];

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      shouldShow={({ editor: ed }) => {
        if (pendingPreviewRef.current || loading) return true;
        const { from, to } = ed.state.selection;
        if (from === to) return false;
        const text = ed.state.doc.textBetween(from, to, "\n");
        return text.trim().length > 0;
      }}
    >
      <div
        className="relative flex max-w-[min(92vw,28rem)] flex-col gap-1.5 rounded-lg border border-surface-200 bg-white px-1.5 py-1 shadow-lg dark:border-surface-700 dark:bg-surface-900"
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleCancel}
              aria-label={t("common.cancel")}
              className="text-surface-400 hover:bg-red-50 hover:text-red-500"
            >
              <Square className="h-3 w-3" />
            </Button>
          </div>
        )}

        {pendingPreview ? (
          <div className="flex w-full flex-col gap-1.5 px-1 py-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-surface-500 dark:text-surface-400">
              <Bot className="h-3.5 w-3.5 text-brand-500" />
              <span>{t("ai.menu.preview")} · {t(`ai.menu.${pendingPreview.actionType}`)}</span>
            </div>
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-50 px-2 py-1.5 text-xs leading-relaxed text-surface-700 dark:bg-surface-800 dark:text-surface-200">
              {pendingPreview.result}
            </p>
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReject}
                className="h-7 gap-1 px-2"
              >
                <X className="h-3.5 w-3.5" />
                {t("ai.menu.reject")}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleAccept}
                className="h-7 gap-1 px-2"
              >
                <Check className="h-3.5 w-3.5" />
                {t("ai.menu.accept")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Bot className="mr-1 h-3.5 w-3.5 text-brand-500" />
            {primaryActions.map((action) => (
              <Button
                key={action}
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => handleAction(action)}
                title={t(`ai.menu.${action}`)}
                className="h-7 gap-1 px-2 text-xs font-medium text-surface-700 dark:text-surface-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t(`ai.menu.${action}`)}</span>
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={loading}
                  aria-label={t("ai.menu.moreActions")}
                  className="text-surface-500 dark:text-surface-400"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={5} className="min-w-[132px]">
                {moreActions.map((action, index) => (
                  <DropdownMenuItem
                    key={action}
                    index={index}
                    disabled={loading}
                    onSelect={() => void handleAction(action)}
                    className="gap-1.5 px-2 py-1.5 text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t(`ai.menu.${action}`)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}
