import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  CalendarDays,
  Clock3,
  FileText,
  Layers3,
  Loader2,
  NotebookTabs,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
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

function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

function normalizeDateForPeriod(value: string, period: WorkRecordPeriod) {
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return new Date();
  if (period === "weekly") return startOfWeek(date);
  if (period === "monthly") return new Date(date.getFullYear(), date.getMonth(), 1);
  return date;
}

function stripMarkdown(value: string) {
  return value
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function WorkRecordPanel({ className }: { className?: string } = {}) {
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

  const periodHint = useMemo(() => {
    if (period === "weekly") return t("workbench.weeklyLedgerHint");
    if (period === "monthly") return t("workbench.monthlyLedgerHint");
    return t("workbench.dailyLedgerHint");
  }, [period, t]);

  const locale = lang === "zh" ? "zh-CN" : "en-US";

  const formatDay = useCallback(
    (date: Date) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
      }).format(date),
    [locale]
  );

  const formatRecordDate = useCallback(
    (value: string, recordPeriod: WorkRecordPeriod) => {
      const date = normalizeDateForPeriod(value, recordPeriod);
      if (Number.isNaN(date.getTime())) return value.slice(0, 10);
      if (recordPeriod === "monthly") {
        return new Intl.DateTimeFormat(locale, {
          year: "numeric",
          month: "long",
        }).format(date);
      }
      if (recordPeriod === "weekly") {
        const end = addDays(date, 6);
        return `${formatDay(date)}${t("date.rangeSeparator")}${formatDay(end)}`;
      }
      return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    },
    [formatDay, locale, t]
  );

  const formatUpdatedAt = useCallback(
    (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value.slice(0, 10);
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    },
    [locale]
  );

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const [currentRes, listRes] = await Promise.all([
        api.getCurrentWorkRecord(period, targetDate),
        api.listWorkRecords({ period, limit: 10 }),
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
    const listRes = await api.listWorkRecords({ period, limit: 10 });
    setRecentRecords(listRes.records);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.saveWorkRecord({ period, targetDate, title, content });
      setRecord(res.record);
      setTargetDate(res.record.targetDate.slice(0, 10));
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
      setTargetDate(res.record.targetDate.slice(0, 10));
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
  const currentTargetDate = record?.targetDate.slice(0, 10) || targetDate;
  const currentPeriodLabel = formatRecordDate(currentTargetDate, period);
  const contentChars = currentPreview.length;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <section className={cn("mt-5 overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-[#0f1724]", className)}>
      <div className="border-b border-surface-200 bg-surface-50/70 px-5 py-5 dark:border-surface-800 dark:bg-[#111b2a] xl:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 shadow-sm dark:bg-brand-500/15 dark:text-brand-300">
              <NotebookTabs className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-surface-950 dark:text-surface-50">
                  {t("workbench.recordLedgerTitle")}
                </h2>
                <span className="rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-300">
                  {t("workbench.notDocumentType")}
                </span>
              </div>
              <p className="mt-1 max-w-[70ch] text-xs leading-5 text-surface-500 dark:text-surface-400">
                {t("workbench.recordLedgerDesc")}
              </p>
            </div>
          </div>
          <TabGroup items={periodItems} value={period} onChange={handlePeriodChange} />
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)_420px]">
        <aside className="border-b border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-[#0f1724] xl:border-b-0 xl:border-r xl:p-6">
          <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-950/35">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-700 dark:text-brand-300">
              <CalendarDays className="h-4 w-4" />
              <span>{t("workbench.currentPeriod")}</span>
            </div>
            <div className="mt-3 text-2xl font-semibold leading-tight text-surface-950 dark:text-surface-50">
              {currentPeriodLabel}
            </div>
            <p className="mt-3 text-xs leading-5 text-surface-500 dark:text-surface-400">
              {periodHint}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-surface-200 bg-white px-3 py-3 dark:border-surface-800 dark:bg-surface-950/25">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400">
                <Layers3 className="h-3.5 w-3.5" />
                <span>{t("workbench.recordCount")}</span>
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                {numberFormatter.format(recentRecords.length)}
              </div>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white px-3 py-3 dark:border-surface-800 dark:bg-surface-950/25">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400">
                <BookOpenText className="h-3.5 w-3.5" />
                <span>{t("workbench.recordChars")}</span>
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                {numberFormatter.format(contentChars)}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-surface-200 bg-white px-3 py-3 dark:border-surface-800 dark:bg-surface-950/25">
            <div className="flex items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{t("workbench.lastUpdated")}</span>
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-surface-900 dark:text-surface-100">
              {record ? formatUpdatedAt(record.updatedAt) : t("workbench.reviewNeedsInput")}
            </div>
          </div>
        </aside>

        <div className="min-w-0 bg-surface-50/60 p-5 dark:bg-[#0d1522] xl:p-6">
          <div className="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-950/30">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-surface-700 dark:text-surface-200">
                <FileText className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                <span>{t("workbench.contentSnapshot")}</span>
              </div>
              <span className="shrink-0 rounded-md bg-surface-100 px-2 py-1 text-[11px] font-medium text-surface-500 dark:bg-surface-800 dark:text-surface-300">
                {periodLabel}
              </span>
            </div>
            <h3 className="mt-3 line-clamp-1 text-lg font-semibold text-surface-950 dark:text-surface-50">
              {title.trim() || t("workbench.recordTitlePlaceholder")}
            </h3>
            <p className="mt-2 min-h-[4.5rem] whitespace-pre-line text-sm leading-6 text-surface-600 dark:text-surface-300">
              {currentPreview || t("workbench.emptySnapshot")}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-950/30">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                  {t("workbench.recordEditor")}
                </h3>
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                  {periodLabel}{t("date.separator")}{currentPeriodLabel}
                </p>
              </div>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-surface-400" />}
            </div>

            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
                  {t("workbench.recordTitle")}
                </span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("workbench.recordTitlePlaceholder")}
                  className="bg-surface-50 dark:bg-[#0f1724]"
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
                  className="min-h-[192px] bg-surface-50 leading-6 dark:bg-[#0f1724]"
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

        <aside className="border-t border-surface-200 bg-white p-5 dark:border-surface-800 dark:bg-[#0f1724] xl:border-l xl:border-t-0 xl:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                {t("workbench.recordLedger")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                {periodLabel}{t("date.separator")}{t("workbench.contentSnapshot")}
              </p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-surface-400" />}
          </div>

          <div className="relative grid gap-3">
            {recentRecords.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-surface-200 px-4 py-8 text-center text-xs leading-5 text-surface-400 dark:border-surface-800">
                {t("workbench.noRecentRecords")}
              </div>
            ) : (
              recentRecords.map((item) => {
                const itemPreview = stripMarkdown(item.content) || t("workbench.recordContentPlaceholder");
                const selected = record?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectRecord(item)}
                    className={cn(
                      "group relative rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/30 dark:hover:border-brand-500/45 dark:hover:bg-brand-500/5",
                      selected
                        ? "border-brand-300 bg-brand-50/60 shadow-sm dark:border-brand-500/45 dark:bg-brand-500/10"
                        : "border-surface-200 bg-surface-50/70 dark:border-surface-800 dark:bg-surface-950/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>{formatRecordDate(item.targetDate, item.period)}</span>
                        </div>
                        <h4 className="mt-2 line-clamp-1 text-sm font-semibold text-surface-950 dark:text-surface-50">
                          {item.title}
                        </h4>
                      </div>
                      <span className="shrink-0 rounded-md border border-surface-200 bg-white px-2 py-1 text-[11px] font-medium text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300">
                        {periodLabel}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-5 text-xs leading-5 text-surface-600 dark:text-surface-300">
                      {itemPreview}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-surface-200 pt-3 text-[11px] text-surface-400 dark:border-surface-800">
                      <span>{t("workbench.lastUpdated")}</span>
                      <span className="tabular-nums">{formatUpdatedAt(item.updatedAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
