import { useState, useEffect } from "react";
import { Scrollbar } from "@/components/ui/scrollbar";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import {
  Brain, Sparkles, Plus, Search, Edit2, Trash2, X,
  User, MapPin, Zap, Layers, Loader2,
  type LucideIcon,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Category = "character" | "location" | "concept" | "other";

interface SettingCard {
  id: string;
  title: string;
  description: string;
  category: Category;
  createdAt: string;
  updatedAt: string;
}

const iconByCategory: Record<Category, LucideIcon> = {
  character: User,
  location: MapPin,
  concept: Zap,
  other: Layers,
};

const colorByCategory: Record<Category, string> = {
  character: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  location: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  concept: "bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50",
  other: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800/50",
};

export function BrainMemoryPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [cards, setCards] = useState<SettingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"all" | Category>("all");

  // CRUD modals state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("character");
  const [formDesc, setFormDesc] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // Delete confirm modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const fetchCards = async () => {
    try {
      setLoading(true);
      const res = await api.listBrainKnowledges();
      setCards(res.knowledges || []);
    } catch (err: any) {
      console.error("Failed to load brain setting cards:", err);
      toast(err.message || "获取设定卡失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingCardId(null);
    setFormTitle("");
    setFormCategory("character");
    setFormDesc("");
    setDialogOpen(true);
  };

  const handleOpenEdit = (card: SettingCard) => {
    setIsEditing(true);
    setEditingCardId(card.id);
    setFormTitle(card.title);
    setFormCategory(card.category);
    setFormDesc(card.description);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDesc.trim()) {
      toast("请填写完整的名称和描述信息", "error");
      return;
    }

    try {
      setSaveLoading(true);
      if (isEditing && editingCardId) {
        await api.updateBrainKnowledge(editingCardId, {
          title: formTitle,
          category: formCategory,
          description: formDesc,
        });
        toast(t("brain.cardSaved"), "success");
      } else {
        await api.createBrainKnowledge({
          title: formTitle,
          category: formCategory,
          description: formDesc,
        });
        toast(t("brain.cardSaved"), "success");
      }
      setDialogOpen(false);
      fetchCards();
    } catch (err: any) {
      toast(err.message || "保存失败", "error");
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
      fetchCards();
    } catch (err: any) {
      toast(err.message || "删除失败", "error");
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

  const categories: ("all" | Category)[] = ["all", "character", "location", "concept", "other"];

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
          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-1.5 self-start px-4 py-2 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg cursor-pointer transition-colors shadow-sm shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t("brain.addCard")}</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 bg-surface-100 p-1 rounded-lg dark:bg-surface-900 max-w-fit">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-white text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-100"
                    : "text-surface-500 hover:text-surface-850 dark:hover:text-surface-300"
                }`}
              >
                {cat === "all" ? "全部" : t(`brain.cardCategory.${cat}`)}
              </button>
            ))}
          </div>

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
            <p className="text-xs text-surface-400">加载设定数据中...</p>
          </div>
        ) : filteredCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredCards.map((card) => {
              const Icon = iconByCategory[card.category];
              const styles = colorByCategory[card.category];
              return (
                <div
                  key={card.id}
                  className="flex flex-col justify-between border border-surface-200 bg-white rounded-xl p-5 hover:shadow-md dark:border-surface-800 dark:bg-surface-900 transition-all group"
                >
                  <div>
                    {/* Header: Icon & Category */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${styles}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[10px] font-medium text-surface-400 tracking-wider">
                        {t(`brain.cardCategory.${card.category}`)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-bold text-surface-900 dark:text-surface-100 mb-2 truncate group-hover:text-brand-500 transition-colors">
                      {card.title}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-surface-500 leading-relaxed line-clamp-3 mb-6 whitespace-pre-wrap">
                      {card.description}
                    </p>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-end gap-1.5 border-t border-surface-100 pt-3 dark:border-surface-800">
                    <Tooltip content="编辑" delay={150}>
                      <button
                        onClick={() => handleOpenEdit(card)}
                        className="p-1.5 text-surface-400 hover:text-brand-500 hover:bg-surface-100 rounded-md transition-colors cursor-pointer dark:hover:bg-surface-800"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <Tooltip content="删除" delay={150}>
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
              立即创建
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogTitle>{isEditing ? t("brain.editCard") : t("brain.addCard")}</DialogTitle>
          <DialogDescription className="sr-only">
            Add or update an AI setting card
          </DialogDescription>
          <form onSubmit={handleSave} className="flex flex-col gap-4 mt-3">
            {/* Title */}
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

            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                {t("brain.cardCategory")}
              </label>
              <Select value={formCategory} onValueChange={(val) => setFormCategory(val as Category)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("brain.cardCategory")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="character">{t("brain.cardCategory.character")}</SelectItem>
                  <SelectItem value="location">{t("brain.cardCategory.location")}</SelectItem>
                  <SelectItem value="concept">{t("brain.cardCategory.concept")}</SelectItem>
                  <SelectItem value="other">{t("brain.cardCategory.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
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

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-surface-600 hover:bg-surface-100 border border-surface-200 rounded-md cursor-pointer dark:text-surface-300 dark:hover:bg-surface-800 dark:border-surface-800"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saveLoading}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 rounded-md cursor-pointer transition-colors"
              >
                {saveLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                <span>确定</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="确定要删除该设定项吗？"
        description="该设定项一旦删除，将无法在AI写作时自动匹配背景，且此操作不可撤销。"
        confirmLabel="删除"
        cancelLabel="取消"
        variant="danger"
        onConfirm={handleDelete}
      />
    </Scrollbar>
  );
}
