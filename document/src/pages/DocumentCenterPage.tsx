import { useState, useEffect, useRef } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { Button } from "@/components/ui/button";
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
  DropdownMenuSeparator,
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
  Folder,
  FolderPlus,
  ArrowLeft,
  Settings,
  FolderSymlink,
  type LucideIcon,
} from "lucide-react";
import mammoth from "mammoth";
import { marked } from "marked";
import { useI18n } from "@/components/I18nProvider";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
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
  const { documents, favorites, loading, createDocument, moveToTrash, updateDocument, refreshDocuments } = useDocuments();
  const viewMode: "grid" | "list" = "grid";
  
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Grouping state
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  
  // Folder Dialog state
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderFormName, setFolderFormName] = useState("");

  // Move document dialog state
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  // Delete folder confirmation state
  const [deleteFolderTargetId, setDeleteFolderTargetId] = useState<string | null>(null);

  const fetchGroups = async () => {
    try {
      const res = await api.listGroups();
      setGroups(res.groups || []);
    } catch (err) {
      console.error("Failed to fetch groups:", err);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, [documents]);

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
      // Auto-assign groupId if inside a folder
      const newId = await createDocument(category || "general", undefined, undefined, activeGroupId);
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

        if (ext === "md") {
          content = sanitizeHtml(await marked.parse(raw));
        } else {
          content = plainTextToHtml(raw);
        }
      }

      // Auto-assign groupId if inside a folder
      const newId = await createDocument("general", title, content, activeGroupId);
      toast(t("toast.importSuccess"), "success");
      onOpenDoc?.(newId);
    } catch (error: any) {
      toast(error.message || t("toast.importFailed"), "error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Folder CRUD actions
  const handleOpenCreateFolder = () => {
    setIsEditingFolder(false);
    setEditingFolderId(null);
    setFolderFormName("");
    setFolderModalOpen(true);
  };

  const handleOpenRenameFolder = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setIsEditingFolder(true);
    setEditingFolderId(id);
    setFolderFormName(name);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderFormName.trim()) return;

    setActionLoading(true);
    try {
      if (isEditingFolder && editingFolderId) {
        await api.renameGroup(editingFolderId, { name: folderFormName });
        toast(t("group.renamed"), "success");
      } else {
        await api.createGroup({ name: folderFormName });
        toast(t("group.created"), "success");
      }
      setFolderModalOpen(false);
      fetchGroups();
    } catch (err: any) {
      toast(err.message || "操作失败", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!deleteFolderTargetId) return;
    setActionLoading(true);
    try {
      await api.deleteGroup(deleteFolderTargetId);
      toast(t("group.deleted"), "success");
      setDeleteFolderTargetId(null);
      if (activeGroupId === deleteFolderTargetId) {
        setActiveGroupId(null);
      }
      fetchGroups();
      refreshDocuments(); // Re-fetch documents to update their local groupId to null
    } catch (err: any) {
      toast(err.message || "删除失败", "error");
    } finally {
      setActionLoading(false);
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
      fetchGroups();
    } catch (err: any) {
      toast(err.message || "移动失败", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const fuzzyMatch = (text: string, query: string) => {
    if (!query) return true;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) qi++;
    }
    return qi === q.length;
  };

  // Document Filtering
  // If searching globally: bypass folder context to allow total retrieval!
  // If not searching: respect the active folder filter.
  const filteredDocs = debouncedQuery
    ? documents.filter((d) => fuzzyMatch(d.title, debouncedQuery) || fuzzyMatch(d.preview || "", debouncedQuery))
    : documents.filter((d) => d.groupId === activeGroupId);

  const mainDocs = filteredDocs.filter((d) => !d.isFavorite);
  const favDocs = favorites.filter((d) => {
    const matchesSearch = !debouncedQuery || fuzzyMatch(d.title, debouncedQuery) || fuzzyMatch(d.preview || "", debouncedQuery);
    const matchesGroup = debouncedQuery || d.groupId === activeGroupId;
    return matchesSearch && matchesGroup;
  });

  const getCategoryKey = (cat: DocumentCategory) => {
    const map: Record<DocumentCategory, "card.design" | "card.journal" | "card.planning" | "card.research" | "card.general"> = {
      design: "card.design", journal: "card.journal", planning: "card.planning", research: "card.research", general: "card.general",
    };
    return map[cat];
  };

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950" options={{ scrollbars: { autoHide: "scroll" } }}>
      {(loading || actionLoading) && <LoadingOverlay />}
      <div className="mx-auto max-w-[1200px] px-20 py-20">
        
        {/* Header Section */}
        <div className="mb-10 flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div>
            {activeGroupId ? (
              <div className="flex flex-col gap-2">
                {/* Breadcrumbs */}
                <div className="flex items-center gap-1.5 text-xs font-medium text-surface-400">
                  <button
                    onClick={() => setActiveGroupId(null)}
                    className="hover:text-surface-700 dark:hover:text-surface-200 cursor-pointer"
                  >
                    {t("group.all")}
                  </button>
                  <span>/</span>
                  <span className="text-surface-600 dark:text-surface-300 truncate max-w-[120px]">
                    {activeGroup?.name || "未知分组"}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setActiveGroupId(null)}
                    className="mr-1 p-1 rounded-md text-surface-500 hover:bg-surface-200 dark:hover:bg-surface-800 transition-colors cursor-pointer"
                    title="返回全部文档"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100 truncate max-w-[360px]">
                    {activeGroup?.name}
                  </h2>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-[32px] font-bold leading-tight text-surface-900 dark:text-surface-100">
                  {t("documents.myDocuments")}
                </h2>
                <p className="mt-2 text-sm text-surface-500">{t("documents.subtitle")}</p>
              </>
            )}
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
                accept=".txt,.md,.docx,.doc"
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

        {/* Folder / Groups Grid (only render at root level and when not searching) */}
        {!activeGroupId && !debouncedQuery && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider">
                {t("group.title")}
              </h3>
              <button
                onClick={handleOpenCreateFolder}
                className="flex items-center gap-1 text-xs text-brand-500 hover:text-brand-600 font-semibold cursor-pointer"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>{t("group.newGroup")}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {groups.map((group) => {
                // Count documents locally in this group
                const docCount = documents.filter((d) => d.groupId === group.id).length;
                return (
                  <div
                    key={group.id}
                    onClick={() => setActiveGroupId(group.id)}
                    className="group relative flex items-center justify-between p-4 border border-surface-200 bg-white rounded-xl hover:shadow-sm hover:border-surface-300 dark:border-surface-800 dark:bg-surface-900 dark:hover:border-surface-700 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shrink-0">
                        <Folder className="h-4.5 w-4.5" fill="currentColor" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate pr-4">
                          {group.name}
                        </h4>
                        <span className="text-[10px] text-surface-400 font-medium">
                          {docCount} {t("editor.characters").replace("字", "个文档")}
                        </span>
                      </div>
                    </div>

                    {/* Folder dropdown menu */}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-800 rounded transition-colors"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[140px]">
                          <DropdownMenuItem onClick={(e) => handleOpenRenameFolder(e, group.id, group.name)}>
                            <span>重命名</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteFolderTargetId(group.id);
                            }}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            <span>删除分组</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Favorite Documents Section */}
        {favDocs.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">
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
                  onMoveToGroup={() => {
                    setMovingDocId(doc.id);
                    setMoveDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main / Regular Documents Section */}
        <div>
          {!activeGroupId && !debouncedQuery && (
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">
              {t("group.ungrouped")} ({mainDocs.length})
            </h3>
          )}
          {activeGroupId && (
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-wider mb-4">
              文档列表 ({mainDocs.length})
            </h3>
          )}

          {mainDocs.length > 0 ? (
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
                  onMoveToGroup={() => {
                    setMovingDocId(doc.id);
                    setMoveDialogOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-surface-200 bg-white rounded-xl dark:border-surface-800 dark:bg-surface-900">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-50 dark:bg-surface-850">
                <FileText className="h-5 w-5 text-surface-300 dark:text-surface-600" />
              </div>
              <h3 className="text-xs font-semibold text-surface-600 dark:text-surface-400">
                该目录下暂无文档
              </h3>
            </div>
          )}
        </div>

        {/* Weekly Stats Flow chart (Only show at root level) */}
        {!activeGroupId && chartData.dayIndices.length > 0 && (
          <div className="mt-12 rounded-xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900">
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

      {/* Create / Rename Folder Modal */}
      <Dialog open={folderModalOpen} onOpenChange={setFolderModalOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>{isEditingFolder ? t("group.renameGroup") : t("group.newGroup")}</DialogTitle>
          <DialogDescription className="sr-only">
            Add or rename a document group folder
          </DialogDescription>
          <form onSubmit={handleSaveFolder} className="flex flex-col gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("group.groupName")}
              </label>
              <input
                type="text"
                required
                value={folderFormName}
                onChange={(e) => setFolderFormName(e.target.value)}
                placeholder={t("group.groupNamePlaceholder")}
                className="w-full px-3 py-2 text-xs border border-surface-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100 placeholder-surface-400"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-100 border border-surface-200 rounded-md cursor-pointer dark:text-surface-300 dark:hover:bg-surface-800 dark:border-surface-800"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-md cursor-pointer transition-colors"
              >
                确定
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Move Document Dialog Modal */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogTitle>{t("group.moveTo")}</DialogTitle>
          <DialogDescription className="sr-only">
            Select a document group to move the document to
          </DialogDescription>
          <div className="flex flex-col gap-1.5 mt-3 max-h-[300px] overflow-y-auto pr-1">
            {/* Ungrouped option */}
            <button
              onClick={() => handleMoveToGroup(null)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-100 cursor-pointer transition-colors text-left border border-transparent hover:border-surface-200 dark:hover:bg-surface-800 dark:hover:border-surface-800"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-400">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold text-surface-700 dark:text-surface-300">
                {t("group.ungrouped")} (移出所有分组)
              </span>
            </button>

            {/* Folder list */}
            {groups.map((group) => {
              const doc = documents.find((d) => d.id === movingDocId);
              const isCurrent = doc?.groupId === group.id;
              return (
                <button
                  key={group.id}
                  onClick={() => handleMoveToGroup(group.id)}
                  disabled={isCurrent}
                  className={`flex items-center justify-between p-3 rounded-lg hover:bg-surface-100 transition-colors text-left border border-transparent hover:border-surface-200 dark:hover:bg-surface-800 dark:hover:border-surface-800 cursor-pointer ${
                    isCurrent ? "opacity-50 cursor-not-allowed bg-surface-50 dark:bg-surface-900" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400 shrink-0">
                      <FolderSymlink className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-semibold text-surface-700 dark:text-surface-300 truncate">
                      {group.name}
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="text-[10px] text-brand-500 font-medium shrink-0">当前分组</span>
                  )}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Modal */}
      <ConfirmModal
        open={!!deleteFolderTargetId}
        onOpenChange={(open) => !open && setDeleteFolderTargetId(null)}
        title={t("group.deleteGroup")}
        description={t("group.deleteGroupDesc")}
        confirmLabel="删除"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleDeleteFolder}
      />

      {/* Delete Document Modal */}
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
