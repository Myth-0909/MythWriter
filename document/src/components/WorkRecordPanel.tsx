import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, NotebookTabs, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TabGroup } from "@/components/ui/tab-group";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { cn } from "@/lib/utils";
import type { WorkRecord, WorkRecordPeriod } from "@/types";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function WorkRecordPanel() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const todayKey = useMemo(() => localDateKey(), []);
  const [period, setPeriod] = useState<WorkRecordPeriod>("daily");
  const [targetDate, setTargetDate] = useState(todayKey);
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const [recentRecords, setRecentRecords] = useState<WorkRecord[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<"generate" | "polish" | null>(null);

  const periodItems = useMemo(
    () => [
      { value: "daily", label: t("workbench.dailyRecord") },
      { value: "weekly", label: t("workbench.weeklyRecord") },
      { value: "monthly", label: t("workbench.monthlyRecord") },
    ],
    [t]
  );

  const periodLabel = useMemo(() => {
    if (period === "weekly") return t("workbench.weeklyRecord");
    if (period === "monthly") return t("workbench.monthlyRecord");
    return t("workbench.dailyRecord");
  }, [period, t]);

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value.slice(0, 10);
      return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: period === "monthly" ? "long" : "short",
        day: period === "monthly" ? undefined : "numeric",
      }).format(date);
    },
    [lang, period]
  );

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const [currentRes, listRes] = await Promise.all([
        api.getCurrentWorkRecord(period, targetDate),
        api.listWorkRecords({ period, limit: 6 }),
      ]);
      setRecord(currentRes.record);
      setRecentRecords(listRes.records);
      setTitle(currentRes.record?.title || "");
      setContent(currentRes.record?.content || "");
    } catch (error: any) {
      toast(error.message || t("workbench.recordLoadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [period, targetDate, t, toast]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handlePeriodChange = (value: string) => {
    setPeriod(value as WorkRecordPeriod);
    setTargetDate(todayKey);
  };

  const handleSelectRecord = (nextRecord: WorkRecord) => {
    setTargetDate(nextRecord.targetDate.slice(0, 10));
    setRecord(nextRecord);
    setTitle(nextRecord.title);
    setContent(nextRecord.content);
  };

  const refreshRecent = async () => {
    const listRes = await api.listWorkRecords({ period, limit: 6 });
    setRecentRecords(listRes.records);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveWorkRecord({ period, targetDate, title, content });
      setRecord(res.record);
      setTitle(res.record.title);
      setContent(res.record.content);
      await refreshRecent();
      toast(t("workbench.recordSaved"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (period === "daily") return;
    setAiLoading("generate");
    try {
      const res = await api.generateWorkRecord({ period, targetDate });
      setRecord(res.record);
      setTitle(res.record.title);
      setContent(res.record.content);
      await refreshRecent();
      toast(t("workbench.recordGenerated"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordAiFailed"), "error");
    } finally {
      setAiLoading(null);
    }
  };

  const handlePolish = async () => {
    if (!content.trim()) {
      toast(t("workbench.recordEmptyForPolish"), "info");
      return;
    }
    setAiLoading("polish");
    try {
      const res = await api.polishWorkRecord({ period, title, content });
      setTitle(res.title);
      setContent(res.content);
      toast(t("workbench.recordPolished"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordAiFailed"), "error");
    } finally {
      setAiLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await api.deleteWorkRecord(record.id);
      setRecord(null);
      setTitle("");
      setContent("");
      await refreshRecent();
      toast(t("workbench.recordDeleted"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordDeleteFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const currentPreview = stripMarkdown(content);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-5 xl:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  <NotebookTabs className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-surface-950 dark:text-surface-50">
                    {t("workbench.recordPanelTitle")}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                    {t("workbench.recordPanelDesc")}
                  </p>
                </div>
              </div>
            </div>
            <TabGroup items={periodItems} value={period} onChange={handlePeriodChange} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-surface-200 bg-surface-50/70 p-4 dark:border-surface-800 dark:bg-surface-950/35">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-300">
                <CalendarDays className="h-4 w-4" />
                <span>{periodLabel}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold text-surface-950 dark:text-surface-50">
                {formatDate(targetDate)}
              </div>
              <p className="mt-3 line-clamp-4 text-xs leading-5 text-surface-500 dark:text-surface-400">
                {currentPreview || t("workbench.recordContentPlaceholder")}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-surface-900">
                  <div className="text-[11px] text-surface-400">{t("workbench.sourceRecords")}</div>
                  <div className="mt-1 text-sm font-semibold text-surface-900 dark:text-surface-100">
                    {recentRecords.length}
                  </div>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 dark:bg-surface-900">
                  <div className="text-[11px] text-surface-400">{t("workbench.reviewStatus")}</div>
                  <div className="mt-1 text-sm font-semibold text-surface-900 dark:text-surface-100">
                    {content.trim() ? t("workbench.reviewReady") : t("workbench.reviewNeedsInput")}
                  </div>
                </div>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-surface-200 bg-surface-50/70 p-4 dark:border-surface-800 dark:bg-surface-950/35">
              <div className="grid gap-3">
                <label className="grid gap-2">
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
                    {t("workbench.recordTitle")}
                  </span>
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t("workbench.recordTitlePlaceholder")}
                    className="bg-white dark:bg-surface-900"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
                    {t("workbench.recordContent")}
                  </span>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder={t("workbench.recordContentPlaceholder")}
                    className="min-h-[176px] bg-white dark:bg-surface-900"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button className="h-10 gap-1.5 px-4" onClick={handleSave} disabled={saving || loading}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>{t("workbench.saveRecord")}</span>
                </Button>
                {period !== "daily" && (
                  <Button
                    variant="outline"
                    className="h-10 gap-1.5 px-4"
                    onClick={handleGenerate}
                    disabled={!!aiLoading || loading}
                  >
                    {aiLoading === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span>{t("workbench.generateRecord")}</span>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 gap-1.5 px-4"
                  onClick={handlePolish}
                  disabled={!!aiLoading || loading}
                >
                  {aiLoading === "polish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  <span>{t("workbench.polishRecord")}</span>
                </Button>
                {record && (
                  <Button
                    variant="ghost"
                    className="h-10 gap-1.5 px-3 text-surface-500 hover:text-red-600 dark:text-surface-400 dark:hover:text-red-300"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{t("common.delete")}</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-surface-200 bg-surface-50/80 p-5 dark:border-surface-800 dark:bg-surface-950/35 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                {t("workbench.recentRecords")}
              </h3>
              <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{periodLabel}</p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-surface-400" />}
          </div>

          <div className="grid gap-2">
            {recentRecords.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-surface-200 px-4 py-8 text-center text-xs leading-5 text-surface-400 dark:border-surface-800">
                {t("workbench.noRecentRecords")}
              </div>
            ) : (
              recentRecords.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectRecord(item)}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white dark:hover:border-brand-500/50 dark:hover:bg-surface-900",
                    record?.id === item.id
                      ? "border-brand-300 bg-white shadow-sm dark:border-brand-500/40 dark:bg-surface-900"
                      : "border-surface-200 bg-white/65 dark:border-surface-800 dark:bg-surface-900/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold text-surface-900 dark:text-surface-100">{item.title}</span>
                    <span className="shrink-0 text-[11px] text-surface-400">{formatDate(item.targetDate)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-surface-500 dark:text-surface-400">
                    {stripMarkdown(item.content) || t("workbench.recordContentPlaceholder")}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
