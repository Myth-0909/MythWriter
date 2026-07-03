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
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Scrollbar } from "@/components/ui/scrollbar";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Code, Code2, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Heading1, Heading2, Heading3,
  Highlighter, Star, Palette, Eraser, ClipboardCheck, Loader2, X, Sparkles, ImagePlus,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { AIBubbleMenu } from "@/components/AIBubbleMenu";
import { api, type WritingReviewSuggestion } from "@/api";
import { cn } from "@/lib/utils";

const TEXT_COLORS = [
  { color: "#1a1a1a", label: "默认" },
  { color: "#e03131", label: "红色" },
  { color: "#e8590c", label: "橙色" },
  { color: "#f08c00", label: "黄色" },
  { color: "#2f9e44", label: "绿色" },
  { color: "#1971c2", label: "蓝色" },
  { color: "#7048e8", label: "紫色" },
  { color: "#9c36b5", label: "紫红" },
];

const LINE_HEIGHTS = [
  { value: "1.5", label: "1.5" },
  { value: "1.8", label: "1.8" },
  { value: "2.0", label: "2.0" },
  { value: "2.5", label: "2.5" },
];

const MAX_INLINE_IMAGE_SIZE = 2 * 1024 * 1024;

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
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved">("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLineHeightPicker, setShowLineHeightPicker] = useState(false);
  const [currentFontSize, setCurrentFontSize] = useState(16);
  const [currentColor, setCurrentColor] = useState("#1a1a1a");
  const [currentLineHeight, setCurrentLineHeight] = useState("1.5");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const loadedDocumentIdRef = useRef<string | null>(null);
  const lastSavedContentRef = useRef<string | null>(null);
  const titleSyncDocumentIdRef = useRef<string | null>(null);
  const isApplyingExternalContentRef = useRef(false);
  const [selectionChars, setSelectionChars] = useState(0);
  const [toolbarRevision, setToolbarRevision] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewScore, setReviewScore] = useState<number | null>(null);
  const [reviewSuggestions, setReviewSuggestions] = useState<WritingReviewSuggestion[]>([]);
  const [ignoredSuggestions, setIgnoredSuggestions] = useState<Set<string>>(new Set());

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
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      FontSize,
      LineHeight,
      Image.configure({
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

    // Flush pending changes of the PREVIOUS document before loading the new one
    if (loadedDocumentIdRef.current && saveTimerRef.current && !isSameDoc) {
      const prevDocId = loadedDocumentIdRef.current;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;

      updateDocumentRef.current(prevDocId, {
        title: titleRef.current,
        content: editor.getHTML(),
      });
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
        updateDocumentRef.current(loadedDocumentIdRef.current, {
          title: titleRef.current,
          content: editor?.getHTML() || "",
        });
      }
    };
  }, [editor]);

  const queueSave = useCallback(() => {
    const targetDocumentId = documentIdRef.current;
    if (!targetDocumentId || !editor) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(() => {
      const content = editor.getHTML();
      const titleVal = titleRef.current;
      lastSavedContentRef.current = content;
      updateDocumentRef.current(targetDocumentId, { title: titleVal, content });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 1500);
    }, 1500);
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
      editor.chain().focus().setImage({ src, alt: file.name }).run();
      toast(t("editor.imageInserted"), "success");
    };
    reader.readAsDataURL(file);
  }, [editor, t, toast]);

  const runWritingReview = useCallback(async () => {
    if (!doc || !editor) return;
    const plain = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n", "\n").trim();
    if (plain.length < 40) {
      toast(t("inspector.noContent"), "info");
      return;
    }
    setInspectorOpen(true);
    setReviewLoading(true);
    try {
      const result = await api.writingReview({ title, content: editor.getHTML() });
      setReviewScore(result.score);
      setReviewSuggestions(result.suggestions || []);
      setIgnoredSuggestions(new Set());
      toast(t("inspector.done"), "success");
    } catch (err: any) {
      toast(err.message || t("inspector.failed"), "error");
    } finally {
      setReviewLoading(false);
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
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="hidden"
            onChange={(event) => {
              insertImageFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
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
        <div className="relative">
          <Tooltip content={t("editor.textColor")}>
            <Toggle size="sm" pressed={showColorPicker}
              onPressedChange={() => { setShowColorPicker(!showColorPicker); setShowLineHeightPicker(false); }}
              aria-label={t("editor.textColor")}
              className="flex flex-col items-center justify-center p-0.5 gap-0.5"
            >
              <Palette className="h-3.5 w-3.5 animate-duration-300" />
              <div className="h-[2px] w-4 rounded-full transition-colors duration-200" style={{ backgroundColor: currentColor }} />
            </Toggle>
          </Tooltip>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 flex flex-wrap gap-1 rounded-lg border border-surface-200 bg-white p-2 shadow-lg dark:border-surface-700 dark:bg-surface-900">
              {TEXT_COLORS.map((c) => (
                <button key={c.color}
                  onClick={() => { editor.chain().focus().setColor(c.color).run(); setShowColorPicker(false); }}
                  className="h-6 w-6 rounded border border-surface-200 cursor-pointer hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.color }} title={c.label}
                />
              ))}
              <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }}
                className="h-6 w-6 rounded border border-surface-200 cursor-pointer text-[10px] leading-tight bg-white dark:bg-surface-800"
                title={t("editor.clearColor")}
              >✕</button>
            </div>
          )}
        </div>
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
          <Tooltip content="减小字号">
            <button
              onClick={() => {
                const raw = editor.getAttributes("textStyle").fontSize as string | undefined;
                const parsed = raw ? parseInt(raw, 10) : currentFontSize;
                const next = Math.max(12, (Number.isNaN(parsed) ? 16 : parsed) - 1);
                setCurrentFontSize(next);
                editor.chain().setFontSize(`${next}px`).run();
              }}
              className="h-7 w-7 rounded-md text-xs font-medium border border-surface-200 hover:bg-surface-100 cursor-pointer flex items-center justify-center dark:border-surface-700 dark:hover:bg-surface-800"
            >−</button>
          </Tooltip>
          <span className="text-xs text-surface-500 w-8 text-center tabular-nums">{currentFontSize}px</span>
          <Tooltip content="增大字号">
            <button
              onClick={() => {
                const raw = editor.getAttributes("textStyle").fontSize as string | undefined;
                const parsed = raw ? parseInt(raw, 10) : currentFontSize;
                const next = Math.min(72, (Number.isNaN(parsed) ? 16 : parsed) + 1);
                setCurrentFontSize(next);
                editor.chain().setFontSize(`${next}px`).run();
              }}
              className="h-7 w-7 rounded-md text-xs font-medium border border-surface-200 hover:bg-surface-100 cursor-pointer flex items-center justify-center dark:border-surface-700 dark:hover:bg-surface-800"
            >+</button>
          </Tooltip>
        </div>

        {/* Line Height */}
        <div className="relative">
          <Tooltip content={t("editor.lineHeight")}>
            <button
              onClick={() => { setShowLineHeightPicker(!showLineHeightPicker); setShowColorPicker(false); }}
              className="h-7 px-2 rounded text-xs font-medium border border-surface-200 hover:bg-surface-100 cursor-pointer dark:border-surface-700 dark:hover:bg-surface-800"
            >
              {t("editor.lineHeight")}: {currentLineHeight}
            </button>
          </Tooltip>
          {showLineHeightPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 flex flex-col gap-0.5 rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-900 min-w-[80px]">
              {LINE_HEIGHTS.map((lh) => (
                <button key={lh.value}
                  onClick={() => { editor.chain().focus().setLineHeight(lh.value).run(); setShowLineHeightPicker(false); }}
                  className="px-2 py-1 text-xs rounded hover:bg-surface-100 cursor-pointer text-left dark:hover:bg-surface-800"
                >{lh.label}</button>
              ))}
            </div>
          )}
        </div>
        <Separator orientation="vertical" className="mx-1 h-4" />
        <Tooltip content={t("editor.insertImage")}>
          <Toggle
            size="sm"
            pressed={false}
            onPressedChange={() => imageInputRef.current?.click()}
            aria-label={t("editor.insertImage")}
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </Toggle>
        </Tooltip>
        <Separator orientation="vertical" className="mx-1 h-4" />
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
          <div className={cn("mx-auto px-12 py-12 transition-[max-width] duration-200", inspectorOpen ? "max-w-[680px]" : "max-w-[720px]")}>
            {/* Title + Favorite */}
            <div className="flex items-start gap-3 mb-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                className="title-input flex-1 text-surface-900 dark:text-surface-100"
                placeholder={t("editor.untitled")}
              />
              <button
                onClick={handleToggleFavorite}
                className={`mt-1.5 p-1.5 rounded-lg cursor-pointer transition-colors shrink-0 ${
                  doc?.isFavorite
                    ? "text-amber-500 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900"
                    : "text-surface-400 hover:text-amber-500 hover:bg-surface-100 dark:hover:bg-surface-800"
                }`}
                title={doc?.isFavorite ? t("editor.unfavorite") : t("editor.favorite")}
              >
                <Star className="h-5 w-5" fill={doc?.isFavorite ? "currentColor" : "none"} />
              </button>
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
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-950">
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
              {reviewLoading ? (
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
          <div className="text-xs text-surface-400">
            {saveStatus === "saving" && t("editor.saving")}
            {saveStatus === "saved" && <span className="text-green-500">{t("editor.saved")}</span>}
          </div>
          {selectionChars > 0 && (
            <span className="text-xs text-brand-400">
              {t("editor.selected")} {selectionChars} {t("editor.characters")}
            </span>
          )}
        </div>
        <span className="text-xs text-surface-400">{charCount} {t("editor.characters")}</span>
      </div>
    </div>
  );
}
