import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { LineHeight } from "@tiptap/extension-text-style/line-height";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Scrollbar } from "@/components/ui/scrollbar";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Code, Code2, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Heading1, Heading2, Heading3,
  Highlighter, Star, Palette, Eraser, ClipboardCheck, Loader2, X, Sparkles, AlertTriangle, RotateCcw, History,
} from "lucide-react";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { AIBubbleMenu } from "@/components/AIBubbleMenu";
import { api, type WritingReviewSuggestion } from "@/api";
import { cn } from "@/lib/utils";
import {
  openAiModelConfig,
  resolveAiReadiness,
  type AiReadinessStatus,
} from "@/lib/aiReadiness";
import { isWritingReviewSnapshotCurrent } from "@/lib/aiWritingReview";
import {
  createSerialDocumentSaveCoordinator,
  DOCUMENT_FLUSH_AUTOSAVE_EVENT,
  type DocumentAutosaveFlushDetail,
} from "@/lib/documentSaveCoordinator";
import { DocumentVersionDialog } from "@/components/DocumentVersionDialog";

const TEXT_COLORS = [
  { color: "#1a1a1a", labelKey: "editor.color.default" as TranslationKey },
  { color: "#e03131", labelKey: "editor.color.red" as TranslationKey },
  { color: "#e8590c", labelKey: "editor.color.orange" as TranslationKey },
  { color: "#f08c00", labelKey: "editor.color.yellow" as TranslationKey },
  { color: "#2f9e44", labelKey: "editor.color.green" as TranslationKey },
  { color: "#1971c2", labelKey: "editor.color.blue" as TranslationKey },
  { color: "#7048e8", labelKey: "editor.color.purple" as TranslationKey },
  { color: "#9c36b5", labelKey: "editor.color.magenta" as TranslationKey },
];

const LINE_HEIGHTS = [
  { value: "1.5", label: "1.5" },
  { value: "1.8", label: "1.8" },
  { value: "2.0", label: "2.0" },
  { value: "2.5", label: "2.5" },
];

const MAX_INLINE_IMAGE_SIZE = 2 * 1024 * 1024;

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) => attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes) => attributes.height ? { height: attributes.height } : {},
      },
    };
  },
});

interface EditorProps {
  documentId?: string;
}

export function Editor({ documentId }: EditorProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { getDocument, loading, updateDocument, toggleFavorite } = useDocuments();
  const doc = documentId ? getDocument(documentId) : undefined;

  const [title, setTitle] = useState("");
  const [charCount, setCharCount] = useState(0);
  const charCountRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState<"" | "unsaved" | "saving" | "saved" | "failed">("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLineHeightPicker, setShowLineHeightPicker] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [currentColor, setCurrentColor] = useState("#1a1a1a");
  const [currentLineHeight, setCurrentLineHeight] = useState("1.5");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialSaveCoordinatorRef = useRef<ReturnType<typeof createSerialDocumentSaveCoordinator> | null>(null);
  if (!serialSaveCoordinatorRef.current) {
    serialSaveCoordinatorRef.current = createSerialDocumentSaveCoordinator();
  }
  const saveSnapshotRef = useRef<(targetDocumentId: string, titleVal: string, content: string) => Promise<boolean>>(
    async () => false
  );
  const pasteImageFileRef = useRef<(file?: File) => void>(() => {});
  const loadedDocumentIdRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const titleSyncDocumentIdRef = useRef<string | null>(null);
  const isApplyingExternalContentRef = useRef(false);
  const [selectionChars, setSelectionChars] = useState(0);
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<WritingReviewSuggestion[]>([]);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());
  const [reviewConfigIssue, setReviewConfigIssue] = useState<Exclude<AiReadinessStatus, "ready"> | null>(null);
  const [reviewError, setReviewError] = useState("");
  const reviewRequestIdRef = useRef(0);
  const reviewSnapshotHtmlRef = useRef<string | null>(null);

  const titleRef = useRef(title);
  const documentIdRef = useRef(documentId);
  const updateDocumentRef = useRef(updateDocument);

  titleRef.current = title;
  documentIdRef.current = documentId;
  updateDocumentRef.current = updateDocument;

  const syncSelectionStyles = useCallback((ed: any) => {
    if (!ed) return;
    const fs = ed.getAttributes("textStyle").fontSize as string | undefined;
    setCurrentFontSize(fs ? parseInt(fs, 10) || 16 : 16);

    const col = ed.getAttributes("textStyle").color as string | undefined;
    setCurrentColor(col || "#1a1a1a");

    const lh = ed.getAttributes("textStyle").lineHeight as string | undefined;
    setCurrentLineHeight(lh || "1.5");
  }, []);

  const editor = useEditor({
    // React StrictMode may destroy the render-time instance before this component's
    // effects run. Creating it after mount prevents document loading from calling
    // commands on that stale instance (notably in React 19 development builds).
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      FontSize,
      LineHeight,
      ResizableImage.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: "editor-image",
        },
      }),
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: t("editor.placeholder") }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    onUpdate: ({ editor: ed }) => {
      if (reviewSnapshotHtmlRef.current && reviewSnapshotHtmlRef.current !== ed.getHTML()) {
        reviewSnapshotHtmlRef.current = null;
        reviewRequestIdRef.current += 1;
        setReviewScore(null);
        setReviewSuggestions([]);
        setIgnoredSuggestions(new Set());
        setReviewError(t("inspector.contentChanged"));
      }
      setToolbarRevision((revision) => revision + 1);
      updateCounts(ed);
      if (!isApplyingExternalContentRef.current) {
        queueSave();
      }
      syncSelectionStyles(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      setToolbarRevision((revision) => revision + 1);
      const { from, to } = ed.state.selection;
      // For select-all (AllSelection), use the exact same value as total count
      if (from === 0 && to === ed.state.doc.content.size) {
        setSelectionChars(charCountRef.current);
        return;
      }
      const text = ed.state.doc.textBetween(from, to, '\n\n', '\n');
      setSelectionChars(countBilingualWords(text));
      syncSelectionStyles(ed);
    },
    editorProps: {
      attributes: {
        class: "prose-editor min-h-[500px] text-surface-800 dark:text-surface-200 focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith("image/"));
        if (!file) return false;
        event.preventDefault();
        pasteImageFileRef.current(file);
        return true;
      },
    },
  });

  const countBilingualWords = useCallback((text: string): number => {
    if (!text) return 0;
    // Count Chinese/Japanese/Korean characters
    const cjk = text.match(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g)?.length || 0;
    // Count English/Western words
    const western = text
      .replace(/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return cjk + western;
  }, []);

  const updateCounts = useCallback((ed: typeof editor) => {
    if (!ed) return;
    const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n\n', '\n');
    const len = countBilingualWords(text);
    charCountRef.current = len;
    setCharCount(len);
  }, [countBilingualWords]);

  // Load document content when switching or when updated externally
  useEffect(() => {
    if (!editor || !doc) return;

    const isSameDoc = loadedDocumentIdRef.current === doc.id;
    const isContentChangedExternally = isSameDoc && 
      lastSavedContentRef.current !== null && 
      lastSavedContentRef.current !== doc.content;

    // If it's the same document and content hasn't changed externally,
    // we only check if the title needs to be updated, then return early.
    if (isSameDoc && !isContentChangedExternally) {
      if (title !== doc.title) {
        titleSyncDocumentIdRef.current = doc.id;
        setTitle(doc.title);
      }
      return;
    }

    reviewRequestIdRef.current += 1;
    reviewSnapshotHtmlRef.current = null;
    setReviewScore(null);
    setReviewSuggestions([]);
    setIgnoredSuggestions(new Set());
    setReviewError("");

    // Flush pending changes of the PREVIOUS document before loading the new one
    if (loadedDocumentIdRef.current && saveTimerRef.current && !isSameDoc) {
      const prevDocId = loadedDocumentIdRef.current;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;

      void saveSnapshotRef.current(prevDocId, titleRef.current, editor.getHTML());
    }

    isApplyingExternalContentRef.current = true;
    editor.chain().setContent(doc.content).setTextSelection(0).run();
    isApplyingExternalContentRef.current = false;
    setSelectionChars(0);
    titleSyncDocumentIdRef.current = doc.id;
    setTitle(doc.title);
    updateCounts(editor);
    loadedDocumentIdRef.current = doc.id;
    lastSavedContentRef.current = doc.content;
  }, [doc?.id, doc?.content, doc?.title, editor, updateCounts]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current && loadedDocumentIdRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        void saveSnapshotRef.current(
          loadedDocumentIdRef.current,
          titleRef.current,
          editor?.getHTML() || ""
        );
      }
    };
  }, [editor]);

  const saveSnapshot = useCallback(async (targetDocumentId: string, titleVal: string, content: string) => {
    if (documentIdRef.current === targetDocumentId) setSaveStatus("saving");
    const result = await serialSaveCoordinatorRef.current!.enqueue(targetDocumentId, async () => {
      await updateDocumentRef.current(targetDocumentId, { title: titleVal, content });
    });

    if (result.success) {
      if (documentIdRef.current === targetDocumentId) {
        lastSavedContentRef.current = content;
      }
      if (result.isLatest && documentIdRef.current === targetDocumentId) {
        setSaveStatus("saved");
        window.setTimeout(() => {
          setSaveStatus((status) => (status === "saved" ? "" : status));
        }, 1500);
      }
      return true;
    }

    if (result.isLatest && documentIdRef.current === targetDocumentId) {
      const error = result.error as { message?: string } | undefined;
      setSaveStatus("failed");
      toast(error?.message || t("editor.saveFailed"), "error");
    }
    return false;
  }, [t, toast]);
  saveSnapshotRef.current = saveSnapshot;

  const queueSave = useCallback(() => {
    const targetDocumentId = documentIdRef.current;
    if (!targetDocumentId || !editor) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus("unsaved");
    saveTimerRef.current = setTimeout(() => {
      const content = editor.getHTML();
      const titleVal = titleRef.current;
      void saveSnapshot(targetDocumentId, titleVal, content);
    }, 1500);
  }, [editor, saveSnapshot]);

  // AI chat / external writers cancel pending autosave and sync last-saved marker
  // so a stale timer cannot overwrite a just-applied AI edit.
  useEffect(() => {
    const onCancel = (event: Event) => {
      const detail = (event as CustomEvent<{ docId?: string }>).detail;
      if (!detail?.docId || detail.docId !== documentIdRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    const onExternalWrite = (event: Event) => {
      const detail = (event as CustomEvent<{ docId?: string; content?: string }>).detail;
      if (!detail?.docId || detail.docId !== documentIdRef.current) return;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (typeof detail.content === "string") {
        lastSavedContentRef.current = detail.content;
      }
      setSaveStatus("saved");
    };
    const onFlushAutosave = (event: Event) => {
      const detail = (event as CustomEvent<DocumentAutosaveFlushDetail>).detail;
      if (!detail?.docId || detail.docId !== documentIdRef.current || !editor) return;
      detail.handled = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void saveSnapshot(detail.docId, titleRef.current, editor.getHTML()).then(detail.complete);
    };
    window.addEventListener("znwriter-document-cancel-autosave", onCancel);
    window.addEventListener("znwriter-document-external-write", onExternalWrite);
    window.addEventListener(DOCUMENT_FLUSH_AUTOSAVE_EVENT, onFlushAutosave);
    return () => {
      window.removeEventListener("znwriter-document-cancel-autosave", onCancel);
      window.removeEventListener("znwriter-document-external-write", onExternalWrite);
      window.removeEventListener(DOCUMENT_FLUSH_AUTOSAVE_EVENT, onFlushAutosave);
    };
  }, [editor, saveSnapshot]);

  const retrySave = useCallback(() => {
    const targetDocumentId = documentIdRef.current;
    if (!targetDocumentId || !editor) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveSnapshot(targetDocumentId, titleRef.current, editor.getHTML());
  }, [editor, saveSnapshot]);

  const flushCurrentDocument = useCallback(async () => {
    const targetDocumentId = documentIdRef.current;
    if (!targetDocumentId || !editor) return false;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    return saveSnapshotRef.current(targetDocumentId, titleRef.current, editor.getHTML());
  }, [editor]);

  // Auto-save on title change
  useEffect(() => {
    if (!documentId || !editor || !doc) return;
    if (titleSyncDocumentIdRef.current === documentId) {
      titleSyncDocumentIdRef.current = null;
      return;
    }
    if (title === doc.title) return; // Prevent initial load/switch auto-save trigger

    queueSave();
  }, [title, documentId, doc, editor, queueSave]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      editor?.commands.focus();
    }
  };

  const handleToggleFavorite = () => {
    if (!documentId) return;
    toggleFavorite(documentId);
    const current = getDocument(documentId);
    toast(current?.isFavorite ? t("toast.favRemoved") : t("toast.favAdded"), "success");
  };

  const insertImageFile = useCallback((file?: File) => {
    if (!file || !editor) return;
    if (file.size > MAX_INLINE_IMAGE_SIZE) {
      toast(t("editor.imageTooBig"), "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:image/")) return;
      editor.chain().focus().setImage({ src, alt: file.name, width: "480" } as any).run();
      toast(t("editor.imagePasted"), "success");
    };
    reader.readAsDataURL(file);
  }, [editor, t, toast]);
  pasteImageFileRef.current = insertImageFile;

  const updateSelectedImageSize = useCallback((key: "width" | "height", value: string) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes("image", { [key]: value.trim() || null }).run();
  }, [editor]);

  const runWritingReview = useCallback(async () => {
    if (!doc || !editor) return;
    const plain = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n", "\n").trim();
    if (plain.length < 40) {
      toast(t("inspector.noContent"), "info");
      return;
    }
    const requestId = reviewRequestIdRef.current + 1;
    reviewRequestIdRef.current = requestId;
    const targetDocumentId = doc.id;
    const targetContent = editor.getHTML();
    setInspectorOpen(true);
    setReviewError("");
    setReviewLoading(true);
    try {
      const readiness = await resolveAiReadiness(() => api.getApiKey());
      if (!isWritingReviewSnapshotCurrent({
        requestId,
        latestRequestId: reviewRequestIdRef.current,
        targetDocumentId,
        currentDocumentId: documentIdRef.current,
        targetContent,
        currentContent: editor.getHTML(),
      })) {
        setReviewError(t("inspector.contentChanged"));
        return;
      }
      if (readiness !== "ready") {
        setReviewConfigIssue(readiness);
        return;
      }
      setReviewConfigIssue(null);
      const result = await api.writingReview({ title, content: targetContent });
      if (!isWritingReviewSnapshotCurrent({
        requestId,
        latestRequestId: reviewRequestIdRef.current,
        targetDocumentId,
        currentDocumentId: documentIdRef.current,
        targetContent,
        currentContent: editor.getHTML(),
      })) {
        setReviewError(t("inspector.contentChanged"));
        return;
      }
      reviewSnapshotHtmlRef.current = targetContent;
      setReviewScore(result.score);
      setReviewSuggestions(result.suggestions || []);
      setIgnoredSuggestions(new Set());
      toast(t("inspector.done"), "success");
    } catch (err: any) {
      if (requestId !== reviewRequestIdRef.current) return;
      const message = err.message || t("inspector.failed");
      setReviewError(message);
      toast(message, "error");
    } finally {
      if (requestId === reviewRequestIdRef.current) setReviewLoading(false);
    }
  }, [doc, editor, title, t, toast]);

  const sendSuggestionToAssistant = useCallback((suggestion: WritingReviewSuggestion) => {
    const text = `${t("inspector.askAssistantPrefix")}\n${suggestion.actionPrompt || suggestion.detail}`;
    window.dispatchEvent(new CustomEvent("znwriter-ai-chat-prefill", { detail: { text } }));
  }, [t]);

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editor) return;

      const editorEl = editor.view.dom;
      if (!editorEl) return;

      const rect = editorEl.getBoundingClientRect();
      const { clientX, clientY } = e;

      // Check if the click is in the left margin (blank area to the left of the text content)
      if (clientX < rect.left && clientY >= rect.top && clientY <= rect.bottom) {
        // Find the document position vertically adjacent to the click at clientY
        // We pass rect.left + 8 as the X coordinate to probe inside the text container
        const coords = editor.view.posAtCoords({ left: rect.left + 8, top: clientY });
        if (coords && coords.pos !== null) {
          e.preventDefault(); // Prevent default focus/selection behavior
          
          const $pos = editor.state.doc.resolve(coords.pos);
          const depth = $pos.depth;
          if (depth > 0) {
            const start = $pos.start(depth);
            const end = $pos.end(depth);
            
            editor.chain().focus().setTextSelection({ from: start, to: end }).run();
          } else {
            editor.chain().focus().setTextSelection(coords.pos).run();
          }
        }
      }
    },
    [editor]
  );

  if (!editor) return null;

  if (documentId && !doc) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-surface-500 dark:bg-surface-950 dark:text-surface-400">
        {loading ? t("editor.loadingDocument") : t("editor.documentUnavailable")}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white dark:bg-surface-950">
      {/* Toolbar */}
      <TooltipProvider delayDuration={150}>
        <div
          data-toolbar-revision={toolbarRevision}
          className="flex flex-wrap items-center gap-0.5 border-b border-surface-200 px-4 py-1.5 dark:border-surface-800"
        >
          {/* Undo / Redo */}
          <Tooltip content={t("editor.undo")}>
            <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().undo().run()} aria-label={t("editor.undo")}>
              <Undo2 className="h-3.5 w-3.5" />
            </Toggle>
          </Tooltip>
          <Tooltip content={t("editor.redo")}>
            <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().redo().run()} aria-label={t("editor.redo")}>
              <Redo2 className="h-3.5 w-3.5" />
            </Toggle>
          </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Headings */}
        {[1, 2, 3].map((level) => {
          const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
          return (
            <Tooltip key={level} content={`H${level}`}>
              <Toggle size="sm"
                pressed={editor.isActive("heading", { level })}
                onPressedChange={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
                aria-label={`H${level}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </Toggle>
            </Tooltip>
          );
        })}
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Text Formatting */}
        <Tooltip content={t("editor.bold")}>
          <Toggle size="sm" pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()} aria-label={t("editor.bold")}>
            <Bold className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.italic")}>
          <Toggle size="sm" pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()} aria-label={t("editor.italic")}>
            <Italic className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.underline")}>
          <Toggle size="sm" pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} aria-label={t("editor.underline")}>
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.strikethrough")}>
          <Toggle size="sm" pressed={editor.isActive("strike")} onPressedChange={() => editor.chain().focus().toggleStrike().run()} aria-label={t("editor.strikethrough")}>
            <Strikethrough className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Code */}
        <Tooltip content={t("editor.code")}>
          <Toggle size="sm" pressed={editor.isActive("code")} onPressedChange={() => editor.chain().focus().toggleCode().run()} aria-label={t("editor.code")}>
            <Code className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.codeBlock")}>
          <Toggle size="sm" pressed={editor.isActive("codeBlock")} onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()} aria-label={t("editor.codeBlock")}>
            <Code2 className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Highlight */}
        <Tooltip content={t("editor.highlight")}>
          <Toggle size="sm" pressed={editor.isActive("highlight")} onPressedChange={() => editor.chain().focus().toggleHighlight().run()} aria-label={t("editor.highlight")}>
            <Highlighter className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>

        {/* Clear Formatting */}
        <Tooltip content={t("editor.clearFormatting")}>
          <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} aria-label={t("editor.clearFormatting")}>
            <Eraser className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>

        {/* Text Color */}
        <DropdownMenu open={showColorPicker} onOpenChange={(nextOpen) => {
          setShowColorPicker(nextOpen);
          if (nextOpen) setShowLineHeightPicker(false);
        }}>
          <Tooltip content={t("editor.textColor")}>
            <DropdownMenuTrigger asChild>
              <Toggle
                size="sm"
                pressed={showColorPicker}
                aria-label={t("editor.textColor")}
                className="flex flex-col items-center justify-center gap-0.5 p-0.5"
              >
                <Palette className="h-3.5 w-3.5 animate-duration-300" />
                <span className="h-[2px] w-4 rounded-full transition-colors duration-200" style={{ backgroundColor: currentColor }} />
              </Toggle>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="start" className="grid min-w-0 grid-cols-3 gap-1 p-2">
            {TEXT_COLORS.map((color, index) => (
              <DropdownMenuItem
                key={color.color}
                index={index}
                aria-label={t(color.labelKey)}
                onSelect={() => editor.chain().focus().setColor(color.color).run()}
                className="h-7 w-7 justify-center p-0"
              >
                <span
                  className="h-5 w-5 rounded border border-surface-200"
                  style={{ backgroundColor: color.color }}
                />
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              index={TEXT_COLORS.length}
              aria-label={t("editor.clearColor")}
              onSelect={() => editor.chain().focus().unsetColor().run()}
              className="h-7 w-7 justify-center p-0 text-xs"
            >
              <X className="h-3.5 w-3.5" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Align */}
        <Tooltip content={t("editor.alignLeft")}>
          <Toggle size="sm" pressed={editor.isActive({ textAlign: "left" })} onPressedChange={() => editor.chain().focus().setTextAlign("left").run()} aria-label={t("editor.alignLeft")}>
            <AlignLeft className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.alignCenter")}>
          <Toggle size="sm" pressed={editor.isActive({ textAlign: "center" })} onPressedChange={() => editor.chain().focus().setTextAlign("center").run()} aria-label={t("editor.alignCenter")}>
            <AlignCenter className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.alignRight")}>
          <Toggle size="sm" pressed={editor.isActive({ textAlign: "right" })} onPressedChange={() => editor.chain().focus().setTextAlign("right").run()} aria-label={t("editor.alignRight")}>
            <AlignRight className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Lists */}
        <Tooltip content={t("editor.bulletList")}>
          <Toggle size="sm" pressed={editor.isActive("bulletList")} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} aria-label={t("editor.bulletList")}>
            <List className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.orderedList")}>
          <Toggle size="sm" pressed={editor.isActive("orderedList")} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} aria-label={t("editor.orderedList")}>
            <ListOrdered className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Blockquote & HR */}
        <Tooltip content={t("editor.blockquote")}>
          <Toggle size="sm" pressed={editor.isActive("blockquote")} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} aria-label={t("editor.blockquote")}>
            <Quote className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={t("editor.horizontalRule")}>
          <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().setHorizontalRule().run()} aria-label={t("editor.horizontalRule")}>
            <Minus className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Font Size */}
        <div className="flex items-center gap-0.5">
          <Tooltip content={t("editor.decreaseFontSize")}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("editor.decreaseFontSize")}
              onClick={() => {
                const raw = editor.getAttributes("textStyle").fontSize as string | undefined;
                const parsed = raw ? parseInt(raw, 10) : currentFontSize;
                const next = Math.max(12, (Number.isNaN(parsed) ? 16 : parsed) - 1);
                setCurrentFontSize(next);
                editor.chain().setFontSize(`${next}px`).run();
              }}
              className="h-7 w-7 text-xs"
            >−</Button>
          </Tooltip>
          <span className="text-xs text-surface-500 w-8 text-center tabular-nums">{currentFontSize}px</span>
          <Tooltip content={t("editor.increaseFontSize")}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={t("editor.increaseFontSize")}
              onClick={() => {
                const raw = editor.getAttributes("textStyle").fontSize as string | undefined;
                const parsed = raw ? parseInt(raw, 10) : currentFontSize;
                const next = Math.min(72, (Number.isNaN(parsed) ? 16 : parsed) + 1);
                setCurrentFontSize(next);
                editor.chain().setFontSize(`${next}px`).run();
              }}
              className="h-7 w-7 text-xs"
            >+</Button>
          </Tooltip>
        </div>

        {/* Line Height */}
        <DropdownMenu open={showLineHeightPicker} onOpenChange={(nextOpen) => {
          setShowLineHeightPicker(nextOpen);
          if (nextOpen) setShowColorPicker(false);
        }}>
          <Tooltip content={t("editor.lineHeight")}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
                {t("editor.lineHeight")}: {currentLineHeight}
              </Button>
            </DropdownMenuTrigger>
          </Tooltip>
          <DropdownMenuContent align="start" className="min-w-20">
            {LINE_HEIGHTS.map((lineHeight, index) => (
              <DropdownMenuItem
                key={lineHeight.value}
                index={index}
                onSelect={() => editor.chain().focus().setLineHeight(lineHeight.value).run()}
                className={cn(currentLineHeight === lineHeight.value && "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300")}
              >
                {lineHeight.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" className="mx-1 h-4" />
        {editor.isActive("image") && (
          <>
            <label htmlFor="editor-image-width" className="flex items-center gap-1 text-[11px] font-medium text-surface-500 dark:text-surface-400">
              <span>{t("editor.imageWidth")}</span>
              <Input
                id="editor-image-width"
                value={String(editor.getAttributes("image").width || "")}
                onChange={(event) => updateSelectedImageSize("width", event.target.value)}
                className="h-7 w-16 bg-transparent px-2 text-xs"
                placeholder="480"
              />
            </label>
            <label htmlFor="editor-image-height" className="flex items-center gap-1 text-[11px] font-medium text-surface-500 dark:text-surface-400">
              <span>{t("editor.imageHeight")}</span>
              <Input
                id="editor-image-height"
                value={String(editor.getAttributes("image").height || "")}
                onChange={(event) => updateSelectedImageSize("height", event.target.value)}
                className="h-7 w-16 bg-transparent px-2 text-xs"
                placeholder={t("editor.imageAutoSize")}
              />
            </label>
            <Separator orientation="vertical" className="mx-1 h-4" />
          </>
        )}
        <Tooltip content={t("inspector.open")}>
          <Toggle
            size="sm"
            pressed={inspectorOpen}
            onPressedChange={() => setInspectorOpen((open) => !open)}
            aria-label={t("inspector.open")}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Tooltip content={reviewSuggestions.length > 0 ? t("inspector.rerun") : t("inspector.run")}>
          <Toggle
            size="sm"
            pressed={reviewLoading}
            onPressedChange={runWritingReview}
            aria-label={t("inspector.run")}
          >
            {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          </Toggle>
        </Tooltip>
        </div>
      </TooltipProvider>

      {/* Editor Area */}
      <div className="flex min-h-0 flex-1">
      <Scrollbar className="min-w-0 flex-1">
        <div className="min-h-full cursor-default" onMouseDown={handleContainerMouseDown}>
          <div className={cn("mx-auto px-5 py-8 transition-[max-width] duration-200 sm:px-8 lg:px-12 lg:py-12", inspectorOpen ? "max-w-[680px]" : "max-w-[720px]")}>
            {/* Title + Favorite */}
            <div className="flex items-start gap-3 mb-4">
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                className="title-input h-auto flex-1 border-0 bg-transparent px-0 py-0 text-surface-900 shadow-none focus-visible:ring-0 dark:text-surface-100"
                placeholder={t("editor.untitled")}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                className={`mt-1.5 shrink-0 rounded-lg ${
                  doc?.isFavorite
                    ? "text-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900"
                    : "text-surface-400 hover:text-amber-500 hover:bg-surface-100 dark:hover:bg-surface-800"
                }`}
                aria-label={doc?.isFavorite ? t("editor.unfavorite") : t("editor.favorite")}
              >
                <Star className="h-5 w-5" fill={doc?.isFavorite ? "currentColor" : "none"} />
              </Button>
              <Tooltip content={t("editor.versionHistory")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setVersionHistoryOpen(true)}
                  className="mt-1.5 shrink-0 rounded-lg text-surface-400 hover:bg-surface-100 hover:text-brand-600 dark:hover:bg-surface-800 dark:hover:text-brand-300"
                  aria-label={t("editor.versionHistory")}
                >
                  <History className="h-5 w-5" />
                </Button>
              </Tooltip>
            </div>

            {/* Separator between title and content */}
            <div className="mb-8 border-b border-surface-200 dark:border-surface-800" />

            <div className="cursor-text">
              <EditorContent editor={editor} />
            </div>
            <AIBubbleMenu editor={editor} documentId={documentId} />
          </div>
        </div>
      </Scrollbar>
      {inspectorOpen && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(320px,calc(100vw-4rem))] shrink-0 flex-col border-l border-surface-200 bg-surface-50 shadow-2xl lg:static lg:z-auto lg:w-[320px] lg:shadow-none dark:border-surface-800 dark:bg-surface-950">
          <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3 dark:border-surface-800">
            <div>
              <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">{t("inspector.title")}</div>
              {reviewScore !== null && (
                <div className="mt-1 text-xs text-surface-500">{t("inspector.score")} {reviewScore}</div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setInspectorOpen(false)}
              title={t("inspector.close")}
              aria-label={t("inspector.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="border-b border-surface-200 p-3 dark:border-surface-800">
            <Button
              type="button"
              onClick={runWritingReview}
              disabled={reviewLoading}
              className="w-full"
            >
              {reviewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
              {reviewLoading ? t("inspector.loading") : reviewSuggestions.length > 0 ? t("inspector.rerun") : t("inspector.run")}
            </Button>
          </div>
          <Scrollbar className="flex-1">
            <div className="space-y-3 p-3">
              {reviewConfigIssue ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-500/20 dark:bg-brand-500/10">
                  <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                    {t(reviewConfigIssue === "missing" ? "ai.configRequiredTitle" : "ai.configCheckFailedTitle")}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-surface-500 dark:text-surface-400">
                    {t(reviewConfigIssue === "missing" ? "ai.configRequiredDesc" : "ai.configCheckFailedDesc")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {reviewConfigIssue === "unavailable" && (
                      <Button type="button" variant="outline" size="sm" onClick={runWritingReview}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("ai.retryConfigCheck")}
                      </Button>
                    )}
                    <Button type="button" size="sm" onClick={openAiModelConfig}>
                      {t("ai.openModelConfig")}
                    </Button>
                  </div>
                </div>
              ) : reviewError ? (
                <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 dark:border-red-500/20 dark:bg-red-500/10">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300">{t("inspector.failed")}</div>
                  <p className="mt-2 break-words text-xs leading-5 text-red-600 dark:text-red-300">{reviewError}</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={runWritingReview}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("inspector.retry")}
                  </Button>
                </div>
              ) : reviewLoading ? (
                <div className="rounded-xl border border-surface-200 bg-white p-4 text-sm text-surface-500 dark:border-surface-800 dark:bg-surface-900">
                  {t("inspector.loading")}
                </div>
              ) : reviewSuggestions.filter((item) => !ignoredSuggestions.has(item.id)).length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-200 bg-white p-4 text-sm leading-relaxed text-surface-500 dark:border-surface-800 dark:bg-surface-900">
                  {t("inspector.empty")}
                </div>
              ) : (
                reviewSuggestions
                  .filter((item) => !ignoredSuggestions.has(item.id))
                  .map((suggestion) => (
                    <div key={suggestion.id} className="rounded-xl border border-surface-200 bg-white p-3 shadow-sm dark:border-surface-800 dark:bg-surface-900">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-surface-900 dark:text-surface-100">{suggestion.title}</div>
                          <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-brand-500">
                            {suggestion.type === "structure" ? t("inspector.structure") : suggestion.type === "tone" ? t("inspector.tone") : suggestion.type === "completeness" ? t("inspector.completeness") : suggestion.type === "density" ? t("inspector.density") : t("inspector.readability")}
                          </div>
                        </div>
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          suggestion.severity === "high" && "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300",
                          suggestion.severity === "medium" && "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
                          suggestion.severity === "low" && "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
                        )}>
                          {suggestion.severity === "high" ? t("inspector.severityHigh") : suggestion.severity === "low" ? t("inspector.severityLow") : t("inspector.severityMedium")}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-surface-600 dark:text-surface-400">{suggestion.detail}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => sendSuggestionToAssistant(suggestion)}
                        >
                          {t("inspector.apply")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIgnoredSuggestions((prev) => new Set(prev).add(suggestion.id))}
                        >
                          {t("inspector.ignore")}
                        </Button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Scrollbar>
        </aside>
      )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-surface-200 px-6 py-2 dark:border-surface-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-surface-400">
            {saveStatus === "unsaved" && <span className="text-amber-500">{t("editor.unsaved")}</span>}
            {saveStatus === "saving" && (
              <span className="inline-flex items-center gap-1 text-surface-500 dark:text-surface-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("editor.saving")}
              </span>
            )}
            {saveStatus === "saved" && <span className="text-green-500">{t("editor.saved")}</span>}
            {saveStatus === "failed" && (
              <span className="inline-flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3 w-3" />
                {t("editor.saveFailed")}
                <Button type="button" variant="ghost" size="sm" onClick={retrySave} className="h-6 px-2 text-[11px]">
                  <RotateCcw className="h-3 w-3" />
                  {t("editor.retrySave")}
                </Button>
              </span>
            )}
          </div>
          {selectionChars > 0 && (
            <span className="text-xs text-brand-400">
              {t("editor.selected")} {selectionChars} {t("editor.characters")}
            </span>
          )}
        </div>
        <span className="text-xs text-surface-400">{charCount} {t("editor.characters")}</span>
      </div>
      {documentId && (
        <DocumentVersionDialog
          open={versionHistoryOpen}
          onOpenChange={setVersionHistoryOpen}
          documentId={documentId}
          flushCurrent={flushCurrentDocument}
        />
      )}
    </div>
  );
}
