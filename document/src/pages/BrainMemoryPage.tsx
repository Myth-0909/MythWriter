import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Scrollbar } from "@/components/ui/scrollbar";
import { CountUp } from "@/components/CountUp";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CreativeLoader } from "@/components/LoadingSpinner";
import { EmptyScene, WorldviewStarMap, type StarMapNode } from "@/components/AtmosphereShowcase";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TabGroup } from "@/components/ui/tab-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import { buildIndexProgressLabel } from "@/lib/interactionState";
import { cn } from "@/lib/utils";
import {
  Brain, Plus, Search, Edit2, Trash2, X, GripVertical,
  Layers, Loader2, Check, RefreshCw, AlertCircle,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface SettingCard {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BrainCategory {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
}

const CATEGORY_COLORS = [
  "#f59e0b", "#10b981", "#6366f1", "#8b5cf6",
  "#ec4899", "#ef4444", "#14b8a6", "#3b82f6",
  "#f97316", "#84cc16", "#a855f7", "#06b6d4",
];

interface CategoryListItemProps {
  category: BrainCategory;
  index: number;
  onEdit: (category: BrainCategory) => void;
  onDelete: (categoryId: string) => void;
  t: (key: TranslationKey) => string;
}

function CategoryListItem({ category, index, onEdit, onDelete, t }: CategoryListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors",
        isDragging
          ? "border-brand-400 bg-brand-50 shadow-sm dark:border-brand-700 dark:bg-brand-950/40"
          : "border-surface-200 hover:bg-surface-50/70 dark:border-surface-800 dark:hover:bg-surface-900/70"
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[11px] font-semibold tabular-nums text-surface-400">
        {String(index + 1).padStart(2, "0")}
      </span>

      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center cursor-grab rounded-lg text-surface-400 hover:bg-surface-100 active:cursor-grabbing dark:hover:bg-surface-800"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
        style={{ backgroundColor: category.color || "#94a3b8" }}
      >
        {category.name.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="break-words text-sm font-semibold leading-5 text-surface-800 dark:text-surface-100">
          {category.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-surface-400">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: category.color || "#94a3b8" }}
          />
          <span>{category.color || "#94a3b8"}</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip content={t("brain.edit")} delay={150}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit(category)}
            className="h-8 w-8 text-surface-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/60 dark:hover:text-brand-300"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <Tooltip content={t("brain.delete")} delay={150}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDelete(category.id)}
            className="h-8 w-8 text-surface-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

export function BrainMemoryPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [cards, setCards] = useState<SettingCard[]>([]);
  const [categories, setCategories] = useState<BrainCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [ragAvailable, setRagAvailable] = useState(false);
  const [reindexAllLoading, setReindexAllLoading] = useState(false);
  const [reindexingIds, setReindexingIds] = useState<Set<string>>(new Set());
  const [reindexProgress, setReindexProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [categoryOrderStatus, setCategoryOrderStatus] = useState<"" | "changed" | "saving" | "saved" | "failed">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Knowledge CRUD
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formDesc, setFormDesc] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Category management dialog
  const [manageDialogOpen, setManageDialogOpen] = useState(false);

  // Category add/edit dialog (inside manage dialog)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [categorySaveLoading, setCategorySaveLoading] = useState(false);

  // Delete confirms
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteCategoryTargetId, setDeleteCategoryTargetId] = useState<string | null>(null);

  // Drag reorder
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const categoryListRef = useRef<HTMLDivElement | null>(null);
  const categoryOrderChanged = useRef(false);

  const restrictToVertical: Modifier = (args) => {
    const container = categoryListRef.current;
    if (!container) return { ...args.transform, x: 0 };

    const rect = container.getBoundingClientRect();
    const overlayRect = args.overlayNodeRect;
    if (!overlayRect) return { ...args.transform, x: 0 };

    let newY = args.transform.y;
    if (args.transform.y < 0) {
      newY = 0;
    }
    const maxDrag = rect.height - overlayRect.height;
    if (args.transform.y > maxDrag) {
      newY = maxDrag;
    }

    return { ...args.transform, x: 0, y: newY };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCategories((prev) => {
      const oldIndex = prev.findIndex((cat) => cat.id === active.id);
      const newIndex = prev.findIndex((cat) => cat.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      categoryOrderChanged.current = true;
      setCategoryOrderStatus("changed");
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleDragCancel = () => {
    // Drag was cancelled, do nothing
  };

  const persistCategoryOrder = async () => {
    if (!categoryOrderChanged.current) return;
    const ordered = categories.map((cat, index) => ({
      id: cat.id,
      sortOrder: index,
    }));
    try {
      setCategoryOrderStatus("saving");
      await api.reorderBrainCategories(ordered);
      categoryOrderChanged.current = false;
      setCategoryOrderStatus("saved");
      window.setTimeout(() => setCategoryOrderStatus((status) => status === "saved" ? "" : status), 1600);
    } catch (err: any) {
      console.error("Failed to reorder categories:", err);
      setCategoryOrderStatus("failed");
      toast(err.message || t("brain.persistOrderFailed"), "error");
    }
  };

  const refreshRagAvailability = async () => {
    try {
      const status = await api.ragStatus();
      setRagAvailable(status.available);
    } catch {
      setRagAvailable(false);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [knowledgesRes, categoriesRes] = await Promise.all([
        api.listBrainKnowledges(),
        api.listBrainCategories(),
      ]);
      setCards(knowledgesRes.knowledges || []);
      setCategories(categoriesRes.categories || []);
      void refreshRagAvailability();
    } catch (err: any) {
      console.error("Failed to load brain data:", err);
      toast(err.message || t("brain.fetchFailed"), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingCardId(null);
    setFormTitle("");
    setFormCategoryId(categories[0]?.id || "");
    setFormDesc("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (card: SettingCard) => {
    setIsEditing(true);
    setEditingCardId(card.id);
    setFormTitle(card.title);
    const cat = categories.find((c) => c.id === card.categoryId) || categories.find((c) => c.name === card.category);
    setFormCategoryId(cat?.id || "");
    setFormDesc(card.description);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDesc.trim()) {
      toast(t("brain.fillComplete"), "error");
      return;
    }
    const cat = categories.find((c) => c.id === formCategoryId);
    try {
      setSaveLoading(true);
      if (isEditing && editingCardId) {
        await api.updateBrainKnowledge(editingCardId, {
          title: formTitle,
          description: formDesc,
          category: cat?.name || "",
          categoryId: cat?.id || null,
        });
      } else {
        await api.createBrainKnowledge({
          title: formTitle,
          category: cat?.name || "",
          categoryId: cat?.id || null,
          description: formDesc,
        });
      }
      toast(t("brain.cardSaved"), "success");
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast(err.message || t("brain.saveFailed"), "error");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.deleteBrainKnowledge(deleteTargetId);
      toast(t("brain.cardDeleted"), "success");
      setDeleteTargetId(null);
      fetchData();
    } catch (err: any) {
      toast(err.message || t("brain.deleteFailed"), "error");
    }
  };

  const handleReindexCard = async (id: string) => {
    setReindexingIds((prev) => new Set(prev).add(id));
    try {
      const result = await api.reindexBrainKnowledge(id);
      if (!result.indexed) throw new Error(result.error || t("rag.reindexFailed"));
      void refreshRagAvailability();
      toast(t("rag.reindexDone"), "success");
    } catch (err: any) {
      toast(err.message || t("rag.reindexFailed"), "error");
    } finally {
      setReindexingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReindexAll = async () => {
    setReindexAllLoading(true);
    setReindexProgress({ done: 0, total: cards.length, failed: 0 });
    try {
      const result = await api.reindexAllBrainKnowledge();
      setReindexProgress({ done: result.indexed, total: result.total, failed: result.failed });
      void refreshRagAvailability();
      toast(`${t("rag.reindexDone")} (${result.indexed}/${result.total})`, result.failed === 0 ? "success" : "info");
    } catch (err: any) {
      toast(err.message || t("rag.reindexFailed"), "error");
    } finally {
      setReindexAllLoading(false);
      window.setTimeout(() => setReindexProgress(null), 3500);
    }
  };

  // Category CRUD
  const handleOpenAddCategory = () => {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryColor(CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length]);
    setCategoryFormOpen(true);
  };

  const handleOpenEditCategory = (cat: BrainCategory) => {
    setEditingCategoryId(cat.id);
    setCategoryName(cat.name);
    setCategoryColor(cat.color || CATEGORY_COLORS[0]);
    setCategoryFormOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    try {
      setCategorySaveLoading(true);
      if (editingCategoryId) {
        const previousCategory = categories.find((cat) => cat.id === editingCategoryId);
        const nextCategoryName = categoryName.trim();
        await api.updateBrainCategory(editingCategoryId, {
          name: nextCategoryName,
          color: categoryColor,
        });
        if (previousCategory && selectedCategory === previousCategory.name) {
          setSelectedCategory(nextCategoryName);
        }
        toast(t("brain.categoryUpdated"), "success");
      } else {
        await api.createBrainCategory({
          name: categoryName.trim(),
          color: categoryColor,
        });
        toast(t("brain.categoryCreated"), "success");
      }
      setCategoryFormOpen(false);
      fetchData();
    } catch (err: any) {
      toast(err.message || t("brain.categorySaveFailed"), "error");
    } finally {
      setCategorySaveLoading(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteCategoryTargetId) return;
    try {
      await api.deleteBrainCategory(deleteCategoryTargetId);
      toast(t("brain.categoryDeleted"), "success");
      setDeleteCategoryTargetId(null);
      fetchData();
    } catch (err: any) {
      toast(err.message || t("brain.categoryDeleteFailed"), "error");
    }
  };

  // Filter cards
  const filteredCards = cards.filter((card) => {
    const matchesSearch =
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || card.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const starMapNodes: StarMapNode[] = cards.map((card) => {
    const category = categories.find((cat) => cat.name === card.category || cat.id === card.categoryId);
    return {
      id: card.id,
      title: card.title,
      category: card.category,
      categoryId: card.categoryId,
      color: category?.color,
      updatedAt: card.updatedAt,
    };
  });

  return (
    <Scrollbar className="flex-1 bg-surface-50 dark:bg-surface-950">
      <div className="mx-auto max-w-[1200px] px-16 py-16">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-2.5">
              <Brain className="h-7 w-7 text-brand-500 animate-pulse animate-duration-3000" />
              <h2 className="text-[28px] font-bold leading-tight text-surface-900 dark:text-surface-100">
                {t("brain.title")}
              </h2>
            </div>
            <p className="text-sm text-surface-500 max-w-[650px] leading-relaxed">
              {t("brain.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReindexAll}
              disabled={reindexAllLoading || cards.length === 0}
              className="h-9 gap-1.5 text-xs"
            >
              {reindexAllLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span>{reindexAllLoading ? t("rag.reindexing") : t("rag.reindexAll")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManageDialogOpen(true)}
              className="h-9 gap-1.5 text-xs"
            >
              <Layers className="h-4 w-4" />
              <span>{t("brain.manageCategories")}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleOpenAdd}
              className="h-9 gap-1.5 bg-brand-500 text-xs text-white shadow-sm hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              <span>{t("brain.addCard")}</span>
            </Button>
          </div>
        </div>

        {reindexProgress && (
          <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-semibold">
                {buildIndexProgressLabel(t("rag.reindexProgress"), reindexProgress.done, reindexProgress.total)}
              </span>
              {reindexProgress.failed > 0 && (
                <span className="text-xs">
                  {t("rag.reindexPartial").replace("{failed}", String(reindexProgress.failed))}
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-surface-950/50">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${reindexProgress.total > 0 ? Math.round((reindexProgress.done / reindexProgress.total) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          {/* Tabs with sliding animation */}
          {categories.length > 0 && (
            <TabGroup
              value={selectedCategory}
              onChange={setSelectedCategory}
              items={[
                { label: t("brain.allCategories"), value: "all" },
                ...categories.map((cat) => ({ label: cat.name, value: cat.name })),
              ]}
            />
          )}

          {/* Search Box */}
          <div className="relative w-full sm:max-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-surface-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("brain.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-9 text-xs dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100"
            />
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {!loading && <WorldviewStarMap nodes={starMapNodes} className="mb-8" />}

        {/* Cards Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-48">
            <CreativeLoader variant="ai" size="lg" label={t("brain.loadingData")} />
          </div>
        ) : filteredCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCards.map((card) => {
              const cat = categories.find((c) => c.name === card.category);
              const catColor = cat?.color || "#94a3b8";
              return (
                <div
                  key={card.id}
                  className="flex flex-col justify-between border border-surface-200 bg-white rounded-xl p-5 hover:shadow-md dark:border-surface-800 dark:bg-surface-900 transition-all group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold"
                        style={{
                          backgroundColor: `${catColor}15`,
                          borderColor: `${catColor}30`,
                          color: catColor,
                        }}
                      >
                        {card.title.charAt(0)}
                      </div>
                      {card.category && (
                        <span className="text-[10px] font-medium text-surface-400 tracking-wider">
                          {card.category}
                        </span>
                      )}
                    </div>

                    <h3 className="mb-2 break-words text-sm font-bold leading-5 text-surface-900 transition-colors group-hover:text-brand-500 dark:text-surface-100">
                      {card.title}
                    </h3>

                    <p className="mb-6 whitespace-pre-wrap break-words text-xs leading-relaxed text-surface-500">
                      {card.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-surface-100 pt-3 dark:border-surface-800">
                    <span
                      className={cn(
                        "inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
                        ragAvailable
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400"
                      )}
                    >
                      {ragAvailable ? (
                        <Check className="h-3 w-3 shrink-0" />
                      ) : (
                        <AlertCircle className="h-3 w-3 shrink-0" />
                      )}
                      <span className="break-words">
                        {ragAvailable ? t("rag.serviceAvailable") : t("rag.serviceUnavailable")}
                      </span>
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                    <Tooltip content={t("rag.reindexCard")} delay={150}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleReindexCard(card.id)}
                        disabled={reindexingIds.has(card.id)}
                        className="h-7 w-7 text-surface-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30"
                      >
                        {reindexingIds.has(card.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </Tooltip>
                    <Tooltip content={t("brain.edit")} delay={150}>
                      <button
                        onClick={() => handleOpenEdit(card)}
                        className="p-1.5 text-surface-400 hover:text-brand-500 hover:bg-surface-100 rounded-md transition-colors cursor-pointer dark:hover:bg-surface-800"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content={t("brain.delete")} delay={150}>
                      <button
                        onClick={() => setDeleteTargetId(card.id)}
                        className="p-1.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyScene
            variant="stars"
            title={t("brain.noCards")}
            description={t("atmosphere.starMap.emptyDesc")}
            actionLabel={t("brain.createNow")}
            onAction={handleOpenAdd}
          />
        )}
      </div>

      {/* Add / Edit Knowledge Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{isEditing ? t("brain.editCard") : t("brain.addCard")}</DialogTitle>
          <DialogDescription className="sr-only">{t("brain.formDesc")}</DialogDescription>
          <form onSubmit={handleSave} className="flex flex-col gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.cardTitle")}
              </label>
              <input
                type="text"
                required
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={t("brain.cardTitlePlaceholder")}
                className="w-full px-3 py-2 text-xs border border-surface-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100 placeholder-surface-400"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.cardCategory")}
              </label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("brain.cardCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {categories.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-surface-400">{t("brain.noCategoryHint")}</div>
                  ) : (
                    categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: cat.color || "#94a3b8" }}
                          />
                          <span>{cat.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.cardDesc")}
              </label>
              <textarea
                required
                rows={5}
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={t("brain.cardDescPlaceholder")}
                className="w-full px-3 py-2 text-xs border border-surface-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100 placeholder-surface-400 resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-100 border border-surface-200 rounded-md cursor-pointer dark:text-surface-300 dark:hover:bg-surface-800 dark:border-surface-800"
              >
                {t("brain.cancel")}
              </button>
              <button
                type="submit"
                disabled={saveLoading}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-md cursor-pointer transition-colors"
              >
                {saveLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>{t("brain.confirm")}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Knowledge Confirmation */}
      <ConfirmModal
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title={t("brain.deleteSettingTitle")}
        description={t("brain.deleteSettingDesc")}
        confirmLabel={t("brain.delete")}
        cancelLabel={t("brain.cancel")}
        variant="danger"
        onConfirm={handleDelete}
      />

      {/* Category Management Dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={(open) => {
        if (!open) persistCategoryOrder();
        setManageDialogOpen(open);
      }}>
        <DialogContent className="max-w-[560px] overflow-hidden p-0 [&>button.absolute]:top-7">
          <div className="border-b border-surface-200 bg-surface-50/80 px-6 py-5 dark:border-surface-800 dark:bg-surface-900/95">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 shadow-sm ring-1 ring-brand-100 dark:bg-brand-950/70 dark:text-brand-300 dark:ring-brand-900">
                    <Layers className="h-4.5 w-4.5" />
                  </div>
                  <DialogTitle className="text-base font-bold text-surface-900 dark:text-surface-100">
                    {t("brain.manageCategories")}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs leading-relaxed text-surface-500 dark:text-surface-400">
                  {t("brain.manageCategoriesDesc")}
                </DialogDescription>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleOpenAddCategory}
                className="shrink-0 bg-brand-500 text-white shadow-sm hover:bg-brand-600"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t("brain.createCategory")}</span>
              </Button>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
              <span className="font-semibold text-surface-700 dark:text-surface-200">
                <CountUp value={categories.length} />
              </span>
              <span>{t("brain.categoryCount")}</span>
              <span className="h-1 w-1 rounded-full bg-surface-300 dark:bg-surface-700" />
              <span>{t("brain.categoryDragHint")}</span>
              {categoryOrderStatus && (
                <>
                  <span className="h-1 w-1 rounded-full bg-surface-300 dark:bg-surface-700" />
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                    categoryOrderStatus === "failed"
                      ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
                      : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200"
                  )}>
                    {categoryOrderStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {categoryOrderStatus === "saved" && <Check className="h-3 w-3" />}
                    {categoryOrderStatus === "failed" && <AlertCircle className="h-3 w-3" />}
                    {categoryOrderStatus === "changed" && t("brain.orderChanged")}
                    {categoryOrderStatus === "saving" && t("brain.orderSaving")}
                    {categoryOrderStatus === "saved" && t("brain.orderSaved")}
                    {categoryOrderStatus === "failed" && (
                      <button type="button" onClick={persistCategoryOrder} className="underline underline-offset-2">
                        {t("brain.orderRetry")}
                      </button>
                    )}
                  </span>
                </>
              )}
            </div>

            {categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-10 text-center dark:border-surface-800 dark:bg-surface-950">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-950/70 dark:text-brand-300">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">
                  {t("brain.noCategoriesTitle")}
                </h3>
                <p className="mt-1 text-xs text-surface-400">
                  {t("brain.noCategories")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleOpenAddCategory}
                  className="mt-5 bg-brand-500 text-white hover:bg-brand-600"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("brain.createCategory")}</span>
                </Button>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVertical]}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext
                  items={categories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div ref={categoryListRef} className="space-y-2 overflow-y-auto pr-1" style={{ maxHeight: 360 }}>
                    {categories.map((cat, index) => (
                      <CategoryListItem
                        key={cat.id}
                        category={cat}
                        index={index}
                        onEdit={handleOpenEditCategory}
                        onDelete={setDeleteCategoryTargetId}
                        t={t}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Add/Edit Form Dialog */}
      <Dialog open={categoryFormOpen} onOpenChange={setCategoryFormOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogTitle>{editingCategoryId ? t("brain.editCategory") : t("brain.createCategory")}</DialogTitle>
          <DialogDescription className="sr-only">{t("brain.categoryFormDesc")}</DialogDescription>
          <form onSubmit={handleSaveCategory} className="flex flex-col gap-4 mt-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.categoryName")}
              </label>
              <Input
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={t("brain.categoryNamePlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.categoryColor")}
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <Button
                    key={color}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCategoryColor(color)}
                    className={cn(
                      "relative h-7 w-7 rounded-full p-0 hover:scale-110",
                      categoryColor === color && "ring-2 ring-brand-500 ring-offset-2"
                    )}
                    style={{ backgroundColor: color }}
                  >
                    {categoryColor === color && (
                      <Check className="h-3.5 w-3.5 text-white" />
                    )}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCategoryFormOpen(false)}
              >
                {t("brain.cancel")}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={categorySaveLoading || !categoryName.trim()}
              >
                {categorySaveLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>{t("brain.confirm")}</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirmation */}
      <ConfirmModal
        open={!!deleteCategoryTargetId}
        onOpenChange={(open) => !open && setDeleteCategoryTargetId(null)}
        title={t("brain.deleteCategory")}
        description={t("brain.deleteCategoryDesc")}
        confirmLabel={t("brain.delete")}
        cancelLabel={t("brain.cancel")}
        variant="danger"
        onConfirm={handleDeleteCategory}
      />
    </Scrollbar>
  );
}
