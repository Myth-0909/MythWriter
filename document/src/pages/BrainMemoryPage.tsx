import { useState, useEffect } from "react";
import { Scrollbar } from "@/components/ui/scrollbar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TabGroup } from "@/components/ui/tab-group";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => setDragIndex(index);

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setCategories((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      setDragIndex(index);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDragIndex(null);
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
        <DialogContent className="max-w-[480px]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-start gap-3 pr-8">
              <DialogTitle>{t("brain.manageCategories")}</DialogTitle>
              <button
                onClick={handleOpenAddCategory}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-md cursor-pointer transition-colors shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t("brain.createCategory")}</span>
              </button>
            </div>
            <DialogDescription className="sr-only">Manage AI brain categories</DialogDescription>
            {categories.length === 0 ? (
              <p className="text-sm text-surface-400 text-center py-8">{t("brain.noCategories")}</p>
            ) : (
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2">
                {categories.map((cat, index) => (
                  <div
                    key={cat.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 rounded-lg border py-2.5 transition-all duration-200 dark:border-surface-800 border-surface-200 ${
                      dragIndex === index
                        ? "opacity-40 scale-[0.98]"
                        : "opacity-100 hover:bg-surface-50 dark:hover:bg-surface-800/50"
                    }`}
                  >
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-surface-400 active:cursor-grabbing" />
                    <span
                      className="inline-block h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || "#94a3b8" }}
                    />
                    <span className="flex-1 text-sm font-medium text-surface-800 dark:text-surface-200 truncate">
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1 text-surface-400 hover:text-brand-500 rounded cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteCategoryTargetId(cat.id)}
                        className="p-1 text-surface-400 hover:text-red-500 rounded cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Add/Edit Form Dialog */}
      <Dialog open={categoryFormOpen} onOpenChange={setCategoryFormOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogTitle>{editingCategoryId ? t("brain.editCategory") : t("brain.createCategory")}</DialogTitle>
          <DialogDescription className="sr-only">Category form</DialogDescription>
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
