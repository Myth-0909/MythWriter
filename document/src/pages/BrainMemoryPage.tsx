import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Modifier } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Scrollbar } from "@/components/ui/scrollbar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TabGroup } from "@/components/ui/tab-group";
import { Button } from "@/components/ui/button";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import { cn } from "@/lib/utils";
import {
  Brain, Sparkles, Plus, Search, Edit2, Trash2, X, GripVertical,
  Layers, Loader2, Check,
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
}

const CATEGORY_COLORS = [
  "#f59e0b", "#10b981", "#6366f1", "#8b5cf6",
  "#ec4899", "#ef4444", "#14b8a6", "#3b82f6",
  "#f97316", "#84cc16", "#a855f7", "#06b6d4",
];

interface SortableCategoryItemProps {
  category: BrainCategory;
  index: number;
  onEdit: (category: BrainCategory) => void;
  onDelete: (categoryId: string) => void;
  t: (key: TranslationKey) => string;
}

function SortableCategoryItem({ category, index, onEdit, onDelete, t }: SortableCategoryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-[background-color,border-color] duration-150 ease-out dark:bg-surface-950",
        isDragging
          ? "z-10 border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/30"
          : "border-surface-200 hover:border-surface-300 hover:bg-surface-50/70 dark:border-surface-800 dark:hover:border-surface-700 dark:hover:bg-surface-900/70"
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 cursor-grab rounded-lg text-surface-400 hover:bg-surface-100 hover:text-surface-700 active:cursor-grabbing dark:hover:bg-surface-900 dark:hover:text-surface-200"
        aria-label={t("brain.categoryDragHint")}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </Button>

      <span className="w-6 text-[10px] font-semibold tabular-nums text-surface-300 dark:text-surface-700">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm"
        style={{ backgroundColor: category.color || "#94a3b8" }}
      >
        {category.name.charAt(0)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-surface-800 dark:text-surface-100">
          {category.name}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-surface-400">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: category.color || "#94a3b8" }}
          />
          <span>{category.color || "#94a3b8"}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
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

  // Drag reorder state
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const categoryDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Constrain drag overlay within the list container bounds
  const categoryListRef = useRef<HTMLDivElement | null>(null);
  const restrictToCategoryList: Modifier = (args) => {
    const container = categoryListRef.current;
    if (!container) return args.transform;
    const containerRect = container.getBoundingClientRect();
    const elementRect = args.containerNodeRect ?? containerRect;

    const minY = containerRect.top - elementRect.top;
    const maxY = containerRect.bottom - elementRect.bottom;

    return {
      ...args.transform,
      x: args.transform.x,
      y: Math.max(minY, Math.min(maxY, args.transform.y)),
    };
  };

  const handleCategoryDragStart = (event: DragStartEvent) => {
    setDraggingCategoryId(String(event.active.id));
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingCategoryId(null);

    if (!over || active.id === over.id) return;

    setCategories((prev) => {
      const oldIndex = prev.findIndex((cat) => cat.id === active.id);
      const newIndex = prev.findIndex((cat) => cat.id === over.id);

      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleCategoryDragCancel = () => {
    setDraggingCategoryId(null);
  };

  const persistCategoryOrder = async () => {
    for (const cat of categories) {
      await api.updateBrainCategory(cat.id, { name: cat.name, color: cat.color ?? undefined });
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
    const cat = categories.find((c) => c.name === card.category);
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
          category: cat?.name || "",
        });
      } else {
        await api.createBrainKnowledge({
          title: formTitle,
          category: cat?.name || "",
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
        await api.updateBrainCategory(editingCategoryId, {
          name: categoryName.trim(),
          color: categoryColor,
        });
      } else {
        await api.createBrainCategory({
          name: categoryName.trim(),
          color: categoryColor,
        });
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
            <button
              onClick={() => setManageDialogOpen(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-surface-700 border border-surface-200 hover:bg-surface-50 rounded-lg cursor-pointer transition-colors dark:text-surface-300 dark:border-surface-700 dark:hover:bg-surface-800"
            >
              <Layers className="h-4 w-4" />
              <span>{t("brain.manageCategories")}</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>{t("brain.addCard")}</span>
            </button>
          </div>
        </div>

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
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("brain.searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2 text-xs border border-surface-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100 placeholder-surface-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-surface-400 hover:text-surface-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Cards Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-48">
            <Loader2 className="h-8 w-8 text-brand-500 animate-spin mb-4" />
            <p className="text-xs text-surface-400">{t("brain.loadingData")}</p>
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

                    <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 mb-2 truncate group-hover:text-brand-500 transition-colors">
                      {card.title}
                    </h3>

                    <p className="text-xs text-surface-500 leading-relaxed line-clamp-3 mb-6 whitespace-pre-wrap">
                      {card.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-1.5 border-t border-surface-100 pt-3 dark:border-surface-800">
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
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-surface-200 rounded-2xl bg-white dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-50 dark:bg-surface-850">
              <Sparkles className="h-6 w-6 text-surface-300 dark:text-surface-600" />
            </div>
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
              {t("brain.noCards")}
            </h3>
            <button
              onClick={handleOpenAdd}
              className="mt-4 px-3.5 py-1.5 text-xs font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-md transition-colors cursor-pointer"
            >
              {t("brain.createNow")}
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Knowledge Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{isEditing ? t("brain.editCard") : t("brain.addCard")}</DialogTitle>
          <DialogDescription className="sr-only">
            Add or update an AI setting card
          </DialogDescription>
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
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                <span className="font-semibold text-surface-700 dark:text-surface-200">
                  {categories.length}
                </span>
                <span>{t("brain.categoryCount")}</span>
                <span className="h-1 w-1 rounded-full bg-surface-300 dark:bg-surface-700" />
                <span>{t("brain.categoryDragHint")}</span>
              </div>
              {draggingCategoryId && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-semibold text-brand-600 dark:bg-brand-950/70 dark:text-brand-300">
                  {t("brain.categoryOrderHint")}
                </span>
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
                sensors={categoryDragSensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToCategoryList]}
                onDragStart={handleCategoryDragStart}
                onDragEnd={handleCategoryDragEnd}
                onDragCancel={handleCategoryDragCancel}
              >
                <SortableContext
                  items={categories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div
                    ref={categoryListRef}
                    className="max-h-[360px] space-y-2 overflow-y-auto pr-1"
                  >
                    {categories.map((cat, index) => (
                      <SortableCategoryItem
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
              <input
                type="text"
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder={t("brain.categoryNamePlaceholder")}
                className="w-full px-3 py-2 text-xs border border-surface-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-100 placeholder-surface-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.categoryColor")}
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCategoryColor(color)}
                    className="relative h-7 w-7 rounded-full transition-transform hover:scale-110 cursor-pointer"
                    style={{ backgroundColor: color }}
                  >
                    {categoryColor === color && (
                      <Check className="absolute inset-0 h-4 w-4 m-auto text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setCategoryFormOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-100 border border-surface-200 rounded-md cursor-pointer dark:text-surface-300 dark:hover:bg-surface-800 dark:border-surface-800"
              >
                {t("brain.cancel")}
              </button>
              <button
                type="submit"
                disabled={categorySaveLoading || !categoryName.trim()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-md cursor-pointer transition-colors"
              >
                {categorySaveLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>{t("brain.confirm")}</span>
              </button>
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
