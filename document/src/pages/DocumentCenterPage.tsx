import { useState, useEffect, useRef } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LoadingOverlay } from "@/components/LoadingSpinner";
import { Scrollbar } from "@/components/ui/scrollbar";
import { WriterFlowChart } from "@/components/WriterFlowChart";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Palette,
  Lightbulb,
  Target,
  Search,
  Plus,
  ChevronDown,
  Upload,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";
import mammoth from "mammoth";
import { marked } from "marked";
import { useI18n } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import { extractPdfText } from "@/lib/pdfText";
import { escapeHtml, sanitizeHtml } from "@/lib/html";
import { categoryLabels, type DocumentCategory } from "@/types";
import { formatFullDateTime, formatRelativeModified } from "@/lib/date";

const iconByCategory: Record<DocumentCategory, LucideIcon> = {
  design: Palette, journal: Lightbulb, planning: Target, research: Search, general: FileText,
};

const colorByCategory: Record<DocumentCategory, string> = {
  design: "bg-amber-100 text-amber-600", journal: "bg-green-100 text-green-600",
  planning: "bg-red-100 text-red-600", research: "bg-cyan-100 text-cyan-600",
  general: "bg-brand-100 text-brand-600",
};

function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => {
      const html = escapeHtml(paragraph.trim()).replace(/\n/g, "<br>");
      return `<p>${html || "&#8203;"}</p>`;
    })
    .join("");
}

interface DocumentCenterPageProps {
  onOpenDoc?: (id: string) => void;
}

export function DocumentCenterPage({ onOpenDoc }: DocumentCenterPageProps) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { documents, favorites, loading, createDocument, moveToTrash } = useDocuments();
  const viewMode: "grid" | "list" = "grid";
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 200);
  };

  const [chartData, setChartData] = useState<{ dayIndices: number[]; words: number[] }>({
    dayIndices: [],
    words: [],
  });

  useEffect(() => {
    api.getWeeklyStats().then((res) => {
      setChartData({
        dayIndices: res.stats.map((s) => s.dayIndex),
        words: res.stats.map((s) => s.words),
      });
    }).catch(() => {});
  }, [documents]);

  const handleNewDocument = async (category?: DocumentCategory) => {
    setActionLoading(true);
    try {
      const newId = await createDocument(category || "general");
      toast(t("toast.newDocCreated"), "success");
      onOpenDoc?.(newId);
    } catch (error: any) {
      toast(error.message || t("toast.createFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      const doc = documents.find((d) => d.id === id);
      await moveToTrash(id);
      toast(`"${doc?.title}" ${t("toast.movedToTrash")}`, "info");
    } catch (error: any) {
      toast(error.message || t("toast.deleteFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "doc") {
      toast(t("toast.importLegacyWordUnsupported"), "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!ext || !["txt", "md", "docx", "pdf"].includes(ext)) {
      toast(t("toast.importUnsupported"), "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      let content = "";
      const title = file.name.replace(/\.[^.]+$/, "");

      if (ext === "docx") {
        // Use convertToHtml to preserve formatting (bold, italic, headings, etc.)
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        content = sanitizeHtml(result.value);
      } else if (ext === "pdf") {
        const text = await extractPdfText(file);
        if (!text.trim()) throw new Error(t("toast.importPdfNoText"));
        content = plainTextToHtml(text);
      } else {
        const raw = await file.text();

        if (ext === "md") {
          // Convert markdown to HTML
          content = sanitizeHtml(await marked.parse(raw));
        } else {
          // TXT: convert plain text with line breaks to HTML paragraphs
          content = plainTextToHtml(raw);
        }
      }

      const newId = await createDocument("general", title, content);
      toast(t("toast.importSuccess"), "success");
      onOpenDoc?.(newId);
    } catch (error: any) {
      toast(error.message || t("toast.importFailed"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fuzzyMatch = (text: string, query: string) => {
    if (!query) return true;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    // Simple fuzzy: all query characters must appear in order
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) qi++;
    }
    return qi === q.length;
  };

  const filteredDocs = debouncedQuery
    ? documents.filter((d) => fuzzyMatch(d.title, debouncedQuery) || fuzzyMatch(d.preview || "", debouncedQuery))
    : documents;
  const mainDocs = filteredDocs.filter((d) => !d.isFavorite);
  const favDocs = favorites.filter((d) => !debouncedQuery || fuzzyMatch(d.title, debouncedQuery) || fuzzyMatch(d.preview || "", debouncedQuery));

  const getCategoryKey = (cat: DocumentCategory) => {
    const map: Record<DocumentCategory, "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general"> = {
      design: "card.design", journal: "card.journal", planning: "card.planning", research: "card.research", general: "card.general",
    };
    return map[cat];
  };

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950" options={{ scrollbars: { autoHide: "scroll" } }}>
      {(loading || actionLoading) && <LoadingOverlay />}
      <div className="mx-auto max-w-[1200px] px-20 py-20">
        <div className="mb-10 flex items-start justify-between">
          <div>
            <h2 className="text-[32px] font-bold leading-tight text-surface-900 dark:text-surface-100">
              {t("documents.myDocuments")}
            </h2>
            <p className="mt-2 text-sm text-surface-500">{t("documents.subtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1 max-w-[320px]">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder={t("documents.search")}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full rounded-lg border border-surface-200 bg-white py-2 pl-9 pr-3 text-sm text-surface-900 placeholder:text-surface-400 transition-colors focus:outline-none focus:ring-2 focus:ring-surface-300 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
            {/* Import button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.pdf,.docx,.doc"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              variant="outline"
              size="lg"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              <span>{t("documents.import")}</span>
            </Button>

            {/* New document button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="gap-1 group">
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("documents.newDocument")}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-300 group-data-[state=open]:rotate-180" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuLabel>{t("documents.selectCategory")}</DropdownMenuLabel>
                {(
                  Object.entries(categoryLabels) as [DocumentCategory, { zh: string; en: string }][]
                ).map(([cat, label], idx) => {
                  const Icon = iconByCategory[cat];
                  const colorClass = colorByCategory[cat];
                  return (
                    <DropdownMenuItem key={cat} index={idx} onClick={() => handleNewDocument(cat)}>
                      <div className={`flex h-7 w-7 items-center justify-center rounded-md dropdown-item-icon ${colorClass.split(" ")[0]}`}>
                        <Icon className={`h-3.5 w-3.5 ${colorClass.split(" ")[1]}`} />
                      </div>
                      <span>{label[lang]}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>

        {favDocs.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-surface-500 uppercase tracking-wider mb-3">
              {t("nav.favorites")} ({favDocs.length})
            </h3>
            <div className={viewMode === "grid" ? "grid grid-cols-4 gap-4" : "flex flex-col gap-2"}>
              {favDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  title={doc.title}
                  preview={doc.preview}
                  date={formatRelativeModified(doc.updatedAt, t)}
                  fullDate={formatFullDateTime(doc.updatedAt, lang)}
                  categoryKey={getCategoryKey(doc.category)}
                  icon={iconByCategory[doc.category]}
                  iconBg={colorByCategory[doc.category]}
                  viewMode={viewMode}
                  onClick={() => onOpenDoc?.(doc.id)}
                  onDelete={() => setDeleteTarget(doc.id)}
                />
              ))}
            </div>
          </div>
        )}

        <div className={viewMode === "grid" ? "grid grid-cols-4 gap-4" : "flex flex-col gap-2"}>
          {mainDocs.map((doc) => (
            <DocumentCard
              key={doc.id}
              title={doc.title}
              preview={doc.preview}
              date={formatRelativeModified(doc.updatedAt, t)}
              fullDate={formatFullDateTime(doc.updatedAt, lang)}
              categoryKey={getCategoryKey(doc.category)}
              icon={iconByCategory[doc.category]}
              iconBg={colorByCategory[doc.category]}
              viewMode={viewMode}
              onClick={() => onOpenDoc?.(doc.id)}
              onDelete={() => setDeleteTarget(doc.id)}
            />
          ))}
        </div>

        {chartData.dayIndices.length > 0 && (
          <div className="mt-10 rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">
                {t("documents.writersFlow")}
              </h3>
              <p className="mt-1 text-xs text-surface-500">{t("documents.activity")}</p>
            </div>
            <WriterFlowChart dayIndices={chartData.dayIndices} words={chartData.words} />
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </Scrollbar>
  );
}
