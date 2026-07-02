import { useState, useEffect, useMemo, useRef } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LoadingOverlay } from "@/components/LoadingSpinner";
import { Scrollbar } from "@/components/ui/scrollbar";
import { WriterFlowChart } from "@/components/WriterFlowChart";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TabGroup } from "@/components/ui/tab-group";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip } from "@/components/ui/tooltip";
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
  ArrowLeft,
  FolderSymlink,
  Bot,
  Brain,
  LayoutGrid,
  List,
  Star,
  FileStack,
  FolderOpen,
  BarChart3,
  Clock3,
  Sparkles,
  SlidersHorizontal,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import mammoth from "mammoth";
import { marked } from "marked";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import { escapeHtml, sanitizeHtml } from "@/lib/html";
import { cn } from "@/lib/utils";
import { categoryLabels, type Document, type DocumentCategory } from "@/types";
import { formatFullDateTime, formatRelativeModified } from "@/lib/date";

type CategoryKey = "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general";
type ViewMode = "grid" | "list";
type CategoryFilter = "all" | DocumentCategory;
type SortMode = "updated" | "created" | "title";

const iconByCategory: Record<DocumentCategory, LucideIcon> = {
  design: Palette,
  journal: Lightbulb,
  planning: Target,
  research: Search,
  general: FileText,
};

const colorByCategory: Record<DocumentCategory, string> = {
  design: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  journal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  planning: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  research: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
  general: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
};

const categoryKeyByCategory: Record<DocumentCategory, CategoryKey> = {
  design: "card.design",
  journal: "card.journal",
  planning: "card.planning",
  research: "card.research",
  general: "card.general",
};

const categoryFilterValues: CategoryFilter[] = [
  "all",
  "design",
  "journal",
  "planning",
  "research",
  "general",
];

const dayI18nKeys: Record<number, TranslationKey> = {
  0: "day.sun",
  1: "day.mon",
  2: "day.tue",
  3: "day.wed",
  4: "day.thu",
  5: "day.fri",
  6: "day.sat",
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

function sortDocuments(docs: Document[], sortMode: SortMode, lang: "zh" | "en") {
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return [...docs].sort((a, b) => {
    if (sortMode === "title") return a.title.localeCompare(b.title, locale);
    const field = sortMode === "created" ? "createdAt" : "updatedAt";
    return new Date(b[field]).getTime() - new Date(a[field]).getTime();
  });
}

interface DocumentCenterPageProps {
  mode?: "workbench" | "documents";
  onOpenDoc?: (id: string) => void;
  onOpenAgentWrite?: () => void;
  onOpenBrain?: () => void;
  groups?: { id: string; name: string }[];
  activeGroupId?: string | null;
  setActiveGroupId?: (id: string | null) => void;
}

export function DocumentCenterPage({
  mode = "documents",
  onOpenDoc,
  onOpenAgentWrite,
  onOpenBrain,
  groups = [],
  activeGroupId = null,
  setActiveGroupId = () => {},
}: DocumentCenterPageProps) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { documents, favorites, loading, createDocument, moveToTrash, updateDocument } = useDocuments();
  const isWorkbench = mode === "workbench";

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [chartData, setChartData] = useState<{ dayIndices: number[]; words: number[] }>({
    dayIndices: [],
    words: [],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    api.getWeeklyStats()
      .then((res) => {
        setChartData({
          dayIndices: res.stats.map((s) => s.dayIndex),
          words: res.stats.map((s) => s.words),
        });
      })
      .catch(() => {});
  }, [documents]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 200);
  };

  const clearSearch = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    setDebouncedQuery("");
  };

  const handleNewDocument = async (category?: DocumentCategory) => {
    setActionLoading(true);
    try {
      const targetGroupId = isWorkbench ? null : activeGroupId;
      const newId = await createDocument(category || "general", undefined, undefined, targetGroupId);
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

    if (!ext || !["txt", "md", "docx"].includes(ext)) {
      toast(t("toast.importUnsupported"), "error");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    try {
      let content = "";
      const title = file.name.replace(/\.[^.]+$/, "");

      if (ext === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        content = sanitizeHtml(result.value);
      } else {
        const raw = await file.text();
        content = ext === "md" ? sanitizeHtml(await marked.parse(raw)) : plainTextToHtml(raw);
      }

      const targetGroupId = isWorkbench ? null : activeGroupId;
      const newId = await createDocument("general", title, content, targetGroupId);
      toast(t("toast.importSuccess"), "success");
      onOpenDoc?.(newId);
    } catch (error: any) {
      toast(error.message || t("toast.importFailed"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleMoveToGroup = async (groupId: string | null) => {
    if (!movingDocId) return;
    setActionLoading(true);
    try {
      await updateDocument(movingDocId, { groupId });
      toast(groupId ? t("group.added") : t("group.removed"), "success");
      setMoveDialogOpen(false);
      setMovingDocId(null);
    } catch (err: any) {
      toast(err.message || t("group.moveFailed"), "error");
    } finally {
      setActionLoading(false);
    }
  };

  const fuzzyMatch = (text: string, query: string) => {
    if (!query) return true;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i += 1) {
      if (lower[i] === q[qi]) qi += 1;
    }
    return qi === q.length;
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const numberFormatter = useMemo(() => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US"), [lang]);

  const filteredDocs = useMemo(() => {
    const scopedDocs = documents.filter((doc) => {
      if (isWorkbench || debouncedQuery) return true;
      return activeGroupId ? doc.groupId === activeGroupId : !doc.groupId;
    });

    const searchedDocs = debouncedQuery
      ? scopedDocs.filter((doc) => fuzzyMatch(doc.title, debouncedQuery) || fuzzyMatch(doc.preview || "", debouncedQuery))
      : scopedDocs;

    const categorizedDocs =
      categoryFilter === "all"
        ? searchedDocs
        : searchedDocs.filter((doc) => doc.category === categoryFilter);

    return sortDocuments(categorizedDocs, sortMode, lang);
  }, [activeGroupId, categoryFilter, debouncedQuery, documents, isWorkbench, lang, sortMode]);

  const mainDocs = filteredDocs.filter((doc) => !doc.isFavorite);
  const favDocs = filteredDocs.filter((doc) => doc.isFavorite);
  const visibleDocsCount = favDocs.length + mainDocs.length;
  const latestDoc = useMemo(() => sortDocuments(documents, "updated", lang)[0] ?? null, [documents, lang]);
  const weeklyTotal = chartData.words.reduce((sum, value) => sum + value, 0);
  const bestDayIndex = chartData.words.reduce((bestIndex, value, index, values) => {
    if (value <= 0) return bestIndex;
    if (bestIndex === -1 || value > values[bestIndex]) return index;
    return bestIndex;
  }, -1);
  const bestDayLabel =
    bestDayIndex >= 0 ? t(dayI18nKeys[chartData.dayIndices[bestDayIndex]]) : t("documents.noActivity");

  const categoryTabs = useMemo(
    () =>
      categoryFilterValues.map((value) => ({
        value,
        label: value === "all" ? t("documents.filterAll") : categoryLabels[value as DocumentCategory][lang],
      })),
    [lang, t]
  );

  const pageTitle =
    !isWorkbench && activeGroupId
      ? activeGroup?.name || t("group.unknown")
      : isWorkbench
        ? t("documents.workspaceTitle")
        : t("documents.myDocuments");
  const pageSubtitle =
    !isWorkbench && activeGroupId
      ? t("documents.folderSubtitle")
      : isWorkbench
        ? t("documents.workspaceSubtitle")
        : t("documents.subtitle");
  const gridClass = viewMode === "grid" ? "grid grid-cols-2 gap-4 xl:grid-cols-4" : "flex flex-col gap-2";
  const emptyIsSearch = !!debouncedQuery || categoryFilter !== "all";

  const openMoveDialog = (docId: string) => {
    setMovingDocId(docId);
    setMoveDialogOpen(true);
  };

  const renderCreateMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="lg" className="group h-11 gap-1.5 px-5">
          <Plus className="h-4 w-4" />
          <span>{t("documents.newDocument")}</span>
          <ChevronDown className="h-3.5 w-3.5 opacity-60 transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        <DropdownMenuLabel>{t("documents.selectCategory")}</DropdownMenuLabel>
        {(Object.entries(categoryLabels) as [DocumentCategory, { zh: string; en: string }][])
          .map(([cat, label], idx) => {
            const Icon = iconByCategory[cat];
            const [bgClass, textClass] = colorByCategory[cat].split(" ");
            return (
              <DropdownMenuItem key={cat} index={idx} onClick={() => handleNewDocument(cat)}>
                <div className={cn("dropdown-item-icon flex h-7 w-7 items-center justify-center rounded-md", bgClass)}>
                  <Icon className={cn("h-3.5 w-3.5", textClass)} />
                </div>
                <span>{label[lang]}</span>
              </DropdownMenuItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Scrollbar
      className="flex-1 bg-surface-50 dark:bg-surface-950"
      options={{ scrollbars: { autoHide: "scroll" } }}
    >
      {(loading || actionLoading) && <LoadingOverlay />}
      <div className="mx-auto w-full max-w-[1360px] px-8 py-8 xl:px-10">
        <div className={cn("grid gap-5", isWorkbench ? "xl:grid-cols-[minmax(0,1.25fr)_440px]" : "grid-cols-1")}>
          <section className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-7 shadow-sm dark:border-surface-800 dark:bg-surface-900">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(15,23,42,0.035)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.035)_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.06)_1px,transparent_1px)]" />
            <div className="relative">
              {!isWorkbench && activeGroupId && (
                <div className="mb-4 flex items-center gap-2 text-xs font-medium text-surface-500">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setActiveGroupId(null)}
                  >
                    {t("group.all")}
                  </Button>
                  <span>/</span>
                  <span className="max-w-[180px] truncate text-surface-700 dark:text-surface-200">
                    {activeGroup?.name || t("group.unknown")}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-8">
                <div className="min-w-0">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{isWorkbench ? t("documents.commandCenter") : t("documents.librarySection")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isWorkbench && activeGroupId && (
                      <Tooltip content={t("documents.backToAll")} delay={150}>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={() => setActiveGroupId(null)}
                          aria-label={t("documents.backToAll")}
                        >
                          <ArrowLeft className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    )}
                    <h1 className="truncate text-[34px] font-semibold leading-tight text-surface-950 dark:text-surface-50">
                      {pageTitle}
                    </h1>
                  </div>
                  <p className="mt-3 max-w-[680px] text-sm leading-6 text-surface-500 dark:text-surface-400">
                    {pageSubtitle}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="lg" className="h-11 gap-1.5 px-4" onClick={onOpenAgentWrite}>
                    <Bot className="h-4 w-4" />
                    <span>{t("documents.aiDraft")}</span>
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.docx,.doc"
                    className="hidden"
                    onChange={handleImport}
                  />
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11 gap-1.5 px-4"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>{t("documents.importDraft")}</span>
                  </Button>
                  {renderCreateMenu()}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-4 gap-3">
                {[
                  { icon: FileStack, label: t("documents.totalDocs"), value: numberFormatter.format(documents.length) },
                  { icon: Star, label: t("documents.favoriteDocs"), value: numberFormatter.format(favorites.length) },
                  { icon: FolderOpen, label: t("documents.groupCount"), value: numberFormatter.format(groups.length) },
                  { icon: BarChart3, label: t("documents.weeklyWords"), value: numberFormatter.format(weeklyTotal) },
                ].map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-surface-200 bg-surface-50/80 p-4 dark:border-surface-800 dark:bg-surface-950/40"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-surface-500 dark:text-surface-400">{metric.label}</span>
                      <metric.icon className="h-4 w-4 text-brand-500" />
                    </div>
                    <div className="mt-3 text-2xl font-semibold tracking-normal text-surface-950 dark:text-surface-50">
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {isWorkbench && (
            <section className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                    {t("documents.writersFlow")}
                  </h2>
                  <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{t("documents.activity")}</p>
                </div>
                <div className="rounded-xl border border-surface-200 px-3 py-2 text-right dark:border-surface-800">
                  <div className="text-[11px] text-surface-400">{t("documents.bestDay")}</div>
                  <div className="mt-0.5 text-sm font-semibold text-surface-800 dark:text-surface-100">{bestDayLabel}</div>
                </div>
              </div>
              {chartData.dayIndices.length > 0 ? (
                <WriterFlowChart dayIndices={chartData.dayIndices} words={chartData.words} />
              ) : (
                <div className="flex h-[200px] items-center justify-center rounded-xl border border-dashed border-surface-200 text-xs text-surface-400 dark:border-surface-800">
                  {t("documents.noActivity")}
                </div>
              )}
            </section>
          )}
        </div>

        {isWorkbench && (
          <section className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-surface-200 bg-surface-950 p-5 text-white shadow-sm dark:border-surface-800 dark:bg-black">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-brand-200">
                <Bot className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">{t("documents.aiStudioTitle")}</h2>
              <p className="mt-3 text-sm leading-6 text-surface-300">{t("documents.aiStudioDesc")}</p>
              <div className="mt-5 rounded-xl border border-white/10 px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-surface-400">
                  <Clock3 className="h-3.5 w-3.5" />
                  <span>{t("documents.latestDocument")}</span>
                </div>
                <button
                  type="button"
                  onClick={() => latestDoc && onOpenDoc?.(latestDoc.id)}
                  disabled={!latestDoc}
                  className="mt-2 w-full truncate text-left text-sm font-semibold text-white transition-colors hover:text-brand-200 disabled:cursor-not-allowed disabled:text-surface-500"
                >
                  {latestDoc?.title || t("documents.noLatestDoc")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  icon: Sparkles,
                  title: t("documents.aiWriteTitle"),
                  desc: t("documents.aiWriteDesc"),
                  actionLabel: t("documents.openAiWriting"),
                  onClick: onOpenAgentWrite,
                },
                {
                  icon: Brain,
                  title: t("documents.aiBrainTitle"),
                  desc: t("documents.aiBrainDesc"),
                  actionLabel: t("documents.openBrain"),
                  onClick: onOpenBrain,
                },
                {
                  icon: Search,
                  title: t("documents.aiContextTitle"),
                  desc: t("documents.aiContextDesc"),
                  actionLabel: t("documents.visibleDocs"),
                  onClick: () => {
                    const firstDoc = filteredDocs[0];
                    if (firstDoc) onOpenDoc?.(firstDoc.id);
                  },
                },
              ].map((feature) => (
                <button
                  key={feature.title}
                  type="button"
                  onClick={feature.onClick}
                  className="group flex min-h-[180px] flex-col justify-between rounded-2xl border border-surface-200 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md dark:border-surface-800 dark:bg-surface-900 dark:hover:border-brand-500/50"
                >
                  <div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-surface-950 dark:text-surface-50">{feature.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-surface-500 dark:text-surface-400">{feature.desc}</p>
                  </div>
                  <div className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-300">
                    <span>{feature.actionLabel}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-5 rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-900">
          <div className="flex items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
              <Input
                type="text"
                placeholder={t("documents.search")}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-11 rounded-xl bg-surface-50 pl-10 pr-10 shadow-none dark:bg-surface-950"
              />
              {searchQuery && (
                <Tooltip content={t("documents.searchClear")} delay={150}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={clearSearch}
                    aria-label={t("documents.searchClear")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </Tooltip>
              )}
            </div>

            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger className="h-11 w-[170px] rounded-xl bg-surface-50 dark:bg-surface-950" aria-label={t("documents.sortBy")}>
                <SelectValue placeholder={t("documents.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated" index={0}>{t("documents.sortUpdated")}</SelectItem>
                <SelectItem value="created" index={1}>{t("documents.sortCreated")}</SelectItem>
                <SelectItem value="title" index={2}>{t("documents.sortTitle")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 rounded-xl border border-surface-200 bg-surface-50 p-1 dark:border-surface-800 dark:bg-surface-950">
              <Tooltip content={t("documents.viewGrid")} delay={150}>
                <Toggle
                  pressed={viewMode === "grid"}
                  onPressedChange={() => setViewMode("grid")}
                  aria-label={t("documents.viewGrid")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Toggle>
              </Tooltip>
              <Tooltip content={t("documents.viewList")} delay={150}>
                <Toggle
                  pressed={viewMode === "list"}
                  onPressedChange={() => setViewMode("list")}
                  aria-label={t("documents.viewList")}
                >
                  <List className="h-4 w-4" />
                </Toggle>
              </Tooltip>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="min-w-0 overflow-x-auto">
              <TabGroup
                items={categoryTabs}
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value as CategoryFilter)}
                size="md"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-surface-500 dark:text-surface-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{t("documents.visibleDocs")}</span>
              <span className="rounded-full bg-surface-100 px-2 py-1 text-surface-800 dark:bg-surface-800 dark:text-surface-100">
                {numberFormatter.format(visibleDocsCount)}
              </span>
            </div>
          </div>
        </section>

        {favDocs.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-950 dark:text-surface-50">
                <Star className="h-4 w-4 text-brand-500" />
                <span>{t("documents.favoritesSection")}</span>
              </h2>
              <span className="text-xs font-medium text-surface-400">
                {numberFormatter.format(favDocs.length)} {t("documents.items")}
              </span>
            </div>
            <div className={gridClass}>
              {favDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  title={doc.title}
                  preview={doc.preview}
                  date={formatRelativeModified(doc.updatedAt, t)}
                  fullDate={formatFullDateTime(doc.updatedAt, lang)}
                  categoryKey={categoryKeyByCategory[doc.category]}
                  icon={iconByCategory[doc.category]}
                  iconBg={colorByCategory[doc.category]}
                  viewMode={viewMode}
                  onClick={() => onOpenDoc?.(doc.id)}
                  onDelete={() => setDeleteTarget(doc.id)}
                  onMoveToGroup={() => openMoveDialog(doc.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-surface-950 dark:text-surface-50">
              <FileText className="h-4 w-4 text-brand-500" />
              <span>{!isWorkbench && activeGroupId ? t("documents.folderDocs") : t("documents.librarySection")}</span>
            </h2>
            <span className="text-xs font-medium text-surface-400">
              {numberFormatter.format(mainDocs.length)} {t("documents.items")}
            </span>
          </div>

          {mainDocs.length > 0 ? (
            <div className={gridClass}>
              {mainDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  title={doc.title}
                  preview={doc.preview}
                  date={formatRelativeModified(doc.updatedAt, t)}
                  fullDate={formatFullDateTime(doc.updatedAt, lang)}
                  categoryKey={categoryKeyByCategory[doc.category]}
                  icon={iconByCategory[doc.category]}
                  iconBg={colorByCategory[doc.category]}
                  viewMode={viewMode}
                  onClick={() => onOpenDoc?.(doc.id)}
                  onDelete={() => setDeleteTarget(doc.id)}
                  onMoveToGroup={() => openMoveDialog(doc.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-12 text-center dark:border-surface-800 dark:bg-surface-900">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-100 text-surface-400 dark:bg-surface-850 dark:text-surface-500">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                {emptyIsSearch ? t("documents.emptySearchTitle") : t("documents.emptyTitle")}
              </h3>
              <p className="mt-2 max-w-[420px] text-sm leading-6 text-surface-500 dark:text-surface-400">
                {emptyIsSearch ? t("documents.emptySearchDesc") : t("documents.emptyDesc")}
              </p>
              <div className="mt-5 flex items-center gap-2">
                {renderCreateMenu()}
                <Button variant="outline" size="lg" className="h-11 gap-1.5" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  <span>{t("documents.import")}</span>
                </Button>
                <Button variant="outline" size="lg" className="h-11 gap-1.5" onClick={onOpenAgentWrite}>
                  <Bot className="h-4 w-4" />
                  <span>{t("documents.aiDraft")}</span>
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>{t("group.moveTo")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("documents.moveDialogDesc")}
          </DialogDescription>
          <div className="mt-3 flex max-h-[300px] flex-col gap-1.5 overflow-y-auto pr-1">
            <Button
              type="button"
              variant="ghost"
              className="h-auto justify-start gap-3 rounded-lg border border-transparent p-3 text-left hover:border-surface-200 dark:hover:border-surface-800"
              onClick={() => handleMoveToGroup(null)}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">
                {t("group.removeFromGroups")}
              </span>
            </Button>

            {groups.map((group) => {
              const doc = documents.find((d) => d.id === movingDocId);
              const isCurrent = doc?.groupId === group.id;
              return (
                <Button
                  key={group.id}
                  type="button"
                  variant="ghost"
                  disabled={isCurrent}
                  onClick={() => handleMoveToGroup(group.id)}
                  className="h-auto justify-between gap-3 rounded-lg border border-transparent p-3 text-left hover:border-surface-200 disabled:opacity-50 dark:hover:border-surface-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400">
                      <FolderSymlink className="h-4 w-4" />
                    </div>
                    <span className="truncate text-xs font-semibold text-surface-700 dark:text-surface-300">
                      {group.name}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="shrink-0 text-[10px] font-medium text-brand-500">
                      {t("group.current")}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

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
