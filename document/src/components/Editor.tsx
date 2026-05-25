import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { LineHeight } from "@tiptap/extension-text-style/line-height";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Scrollbar } from "@/components/ui/scrollbar";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Code, Code2, Quote, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Undo2, Redo2, Heading1, Heading2, Heading3,
  Highlighter, Star, Palette,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";

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

const FONT_SIZES = [
  { size: "12px", label: "小" },
  { size: "16px", label: "默认" },
  { size: "20px", label: "中" },
  { size: "24px", label: "大" },
  { size: "30px", label: "特大" },
];

const LINE_HEIGHTS = [
  { value: "1.5", label: "1.5" },
  { value: "1.8", label: "1.8" },
  { value: "2.0", label: "2.0" },
  { value: "2.5", label: "2.5" },
];

interface EditorProps {
  documentId?: string;
}

export function Editor({ documentId }: EditorProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { getDocument, updateDocument, toggleFavorite } = useDocuments();
  const doc = documentId ? getDocument(documentId) : undefined;

  const [title, setTitle] = useState("");
  const [charCount, setCharCount] = useState(0);
  const charCountRef = useRef(0);
  const [saveStatus, setSaveStatus] = useState<"" | "saving" | "saved">("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const [showLineHeightPicker, setShowLineHeightPicker] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectionChars, setSelectionChars] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: t("editor.placeholder") }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    onUpdate: ({ editor: ed }) => {
      updateCounts(ed);
      autoSave(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection;
      // For select-all (AllSelection), use the exact same value as total count
      if (from === 0 && to === ed.state.doc.content.size) {
        setSelectionChars(charCountRef.current);
        return;
      }
      const text = ed.state.doc.textBetween(from, to, '\n\n', '\n');
      setSelectionChars(text.length);
    },
    editorProps: {
      attributes: {
        class: "prose-editor min-h-[500px] text-surface-800 dark:text-surface-200 focus:outline-none",
      },
    },
  });

  // Load document content when switching
  useEffect(() => {
    if (!editor || !doc) return;
    editor.commands.setContent(doc.content);
    editor.commands.setTextSelection(0);
    setSelectionChars(0);
    setTitle(doc.title);
    updateCounts(editor);
  }, [documentId]);

  const updateCounts = useCallback((ed: typeof editor) => {
    if (!ed) return;
    const len = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n\n', '\n').length;
    charCountRef.current = len;
    setCharCount(len);
  }, []);

  const autoSave = useCallback(
    (ed: typeof editor) => {
      if (!documentId || !ed) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(() => {
        const content = ed.getHTML();
        updateDocument(documentId, { title, content });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 1500);
      }, 1500);
    },
    [documentId, title, updateDocument]
  );

  // Auto-save on title change
  useEffect(() => {
    if (title && editor && documentId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(() => {
        updateDocument(documentId, { title, content: editor.getHTML() });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 1500);
      }, 1500);
    }
  }, [title]);

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

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-surface-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-surface-200 px-4 py-1.5 dark:border-surface-800">
        {/* Undo / Redo */}
        <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().undo().run()} aria-label={t("editor.undo")}>
          <Undo2 className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().redo().run()} aria-label={t("editor.redo")}>
          <Redo2 className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Headings */}
        {[1, 2, 3].map((level) => {
          const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
          return (
            <Toggle key={level} size="sm"
              pressed={editor.isActive("heading", { level })}
              onPressedChange={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
              aria-label={`H${level}`}
            >
              <Icon className="h-3.5 w-3.5" />
            </Toggle>
          );
        })}
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Text Formatting */}
        <Toggle size="sm" pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()} aria-label={t("editor.bold")}>
          <Bold className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()} aria-label={t("editor.italic")}>
          <Italic className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive("underline")} onPressedChange={() => editor.chain().focus().toggleUnderline().run()} aria-label={t("editor.underline")}>
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive("strike")} onPressedChange={() => editor.chain().focus().toggleStrike().run()} aria-label={t("editor.strikethrough")}>
          <Strikethrough className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Code */}
        <Toggle size="sm" pressed={editor.isActive("code")} onPressedChange={() => editor.chain().focus().toggleCode().run()} aria-label={t("editor.code")}>
          <Code className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive("codeBlock")} onPressedChange={() => editor.chain().focus().toggleCodeBlock().run()} aria-label={t("editor.codeBlock")}>
          <Code2 className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Highlight */}
        <Toggle size="sm" pressed={editor.isActive("highlight")} onPressedChange={() => editor.chain().focus().toggleHighlight().run()} aria-label={t("editor.highlight")}>
          <Highlighter className="h-3.5 w-3.5" />
        </Toggle>

        {/* Text Color */}
        <div className="relative">
          <Toggle size="sm" pressed={showColorPicker}
            onPressedChange={() => { setShowColorPicker(!showColorPicker); setShowFontSizePicker(false); setShowLineHeightPicker(false); }}
            aria-label={t("editor.textColor")}
          >
            <Palette className="h-3.5 w-3.5" />
          </Toggle>
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
        <Toggle size="sm" pressed={editor.isActive({ textAlign: "left" })} onPressedChange={() => editor.chain().focus().setTextAlign("left").run()} aria-label={t("editor.alignLeft")}>
          <AlignLeft className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive({ textAlign: "center" })} onPressedChange={() => editor.chain().focus().setTextAlign("center").run()} aria-label={t("editor.alignCenter")}>
          <AlignCenter className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive({ textAlign: "right" })} onPressedChange={() => editor.chain().focus().setTextAlign("right").run()} aria-label={t("editor.alignRight")}>
          <AlignRight className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Lists */}
        <Toggle size="sm" pressed={editor.isActive("bulletList")} onPressedChange={() => editor.chain().focus().toggleBulletList().run()} aria-label={t("editor.bulletList")}>
          <List className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={editor.isActive("orderedList")} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()} aria-label={t("editor.orderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Blockquote & HR */}
        <Toggle size="sm" pressed={editor.isActive("blockquote")} onPressedChange={() => editor.chain().focus().toggleBlockquote().run()} aria-label={t("editor.blockquote")}>
          <Quote className="h-3.5 w-3.5" />
        </Toggle>
        <Toggle size="sm" pressed={false} onPressedChange={() => editor.chain().focus().setHorizontalRule().run()} aria-label={t("editor.horizontalRule")}>
          <Minus className="h-3.5 w-3.5" />
        </Toggle>
        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Font Size */}
        <div className="relative">
          <button
            onClick={() => { setShowFontSizePicker(!showFontSizePicker); setShowColorPicker(false); setShowLineHeightPicker(false); }}
            className="h-7 px-2 rounded text-xs font-medium border border-surface-200 hover:bg-surface-100 cursor-pointer dark:border-surface-700 dark:hover:bg-surface-800"
          >{t("editor.fontSize")}</button>
          {showFontSizePicker && (
            <div className="absolute top-full left-0 mt-1 z-50 flex flex-col gap-0.5 rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:border-surface-700 dark:bg-surface-900 min-w-[100px]">
              {FONT_SIZES.map((fs) => (
                <button key={fs.size}
                  onClick={() => { editor.chain().focus().setFontSize(fs.size).run(); setShowFontSizePicker(false); }}
                  className="px-2 py-1 text-xs rounded hover:bg-surface-100 cursor-pointer text-left dark:hover:bg-surface-800"
                  style={{ fontSize: fs.size }}
                >{fs.label} ({fs.size})</button>
              ))}
              <button
                onClick={() => { editor.chain().focus().unsetFontSize().run(); setShowFontSizePicker(false); }}
                className="px-2 py-1 text-xs rounded hover:bg-surface-100 cursor-pointer text-left text-surface-500 dark:hover:bg-surface-800"
              >{t("editor.clearFontSize")}</button>
            </div>
          )}
        </div>

        {/* Line Height */}
        <div className="relative">
          <button
            onClick={() => { setShowLineHeightPicker(!showLineHeightPicker); setShowColorPicker(false); setShowFontSizePicker(false); }}
            className="h-7 px-2 rounded text-xs font-medium border border-surface-200 hover:bg-surface-100 cursor-pointer dark:border-surface-700 dark:hover:bg-surface-800"
          >{t("editor.lineHeight")}</button>
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
      </div>

      {/* Editor Area */}
      <Scrollbar className="flex-1">
        <div className="mx-auto max-w-[720px] px-12 py-12">
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

          <EditorContent editor={editor} />
        </div>
      </Scrollbar>

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
