import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Clock3,
  Edit3,
  FileText,
  Layers3,
  Loader2,
  NotebookTabs,
  Save,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { marked } from "marked";
import { api } from "@/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { CountUp } from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TabGroup } from "@/components/ui/tab-group";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { sanitizeHtml } from "@/lib/html";
import { cn } from "@/lib/utils";
import type { WorkRecord, WorkRecordPeriod } from "@/types";

const MAX_INLINE_IMAGE_SIZE = 2 * 1024 * 1024;
const imageSourcePattern = /!\[[^\]]*]\((data:image\/[^)]+)\)|<img\b[^>]*\bsrc=["'](data:image\/[^"']+)["'][^>]*>/gi;

type WorkRecordPanelView = "editor" | "list";

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
    .replace(imageSourcePattern, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getDateKey(value: string) {
  return localDateKey(normalizeDateForPeriod(value, "daily"));
}

export function WorkRecordPanel({ className, view = "editor" }: { className?: string; view?: WorkRecordPanelView } = {}) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isListView = view === "list";
  const todayKey = useMemo(() => localDateKey(), []);
  const [period, setPeriod] = useState<WorkRecordPeriod>("daily");
  const [listPeriod, setListPeriod] = useState<WorkRecordPeriod>("daily");
  const [targetDate, setTargetDate] = useState(todayKey);
  const [record, setRecord] = useState<WorkRecord | null>(null);
  const [recentRecords, setRecentRecords] = useState<WorkRecord[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [editRecord, setEditRecord] = useState<WorkRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WorkRecord | null>(null);
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

  const loadCurrentRecord = useCallback(async () => {
    setLoading(true);
    try {
      const currentRes = await api.getCurrentWorkRecord(period, targetDate);
      setRecord(currentRes.record);
      setTitle(currentRes.record?.title || "");
      setContent(currentRes.record?.content || "");
    } catch (error: any) {
      toast(error.message || t("workbench.recordLoadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [period, targetDate, t, toast]);

  const loadRecentRecords = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await api.listWorkRecords({ period: listPeriod, limit: 100 });
      setRecentRecords(listRes.records);
    } catch (error: any) {
      toast(error.message || t("workbench.recordLoadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [listPeriod, t, toast]);

  useEffect(() => {
    if (!isListView) loadCurrentRecord();
  }, [isListView, loadCurrentRecord]);

  useEffect(() => {
    loadRecentRecords();
  }, [loadRecentRecords]);

  const handlePeriodChange = (value: string) => {
    const nextPeriod = value as WorkRecordPeriod;
    setPeriod(nextPeriod);
    setListPeriod(nextPeriod);
    setTargetDate(todayKey);
  };

  const handleSelectRecord = (nextRecord: WorkRecord) => {
    setPeriod(nextRecord.period);
    setListPeriod(nextRecord.period);
    setTargetDate(nextRecord.targetDate.slice(0, 10));
    setRecord(nextRecord);
    setTitle(nextRecord.title);
    setContent(nextRecord.content);
  };

  const refreshRecent = async () => {
    const listRes = await api.listWorkRecords({ period: listPeriod, limit: 100 });
    setRecentRecords(listRes.records);
  };

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) {
      toast(t("workbench.recordEmptyForSave"), "info");
      return;
    }
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

  const openEditRecord = (nextRecord: WorkRecord) => {
    setEditRecord(nextRecord);
    setEditTitle(nextRecord.title);
    setEditContent(nextRecord.content);
    setEditTargetDate(nextRecord.targetDate.slice(0, 10));
  };

  const handleSaveEdit = async () => {
    if (!editRecord) return;
    if (!editTitle.trim() && !editContent.trim()) {
      toast(t("workbench.recordEmptyForSave"), "info");
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveWorkRecord({
        period: editRecord.period,
        targetDate: editTargetDate || editRecord.targetDate.slice(0, 10),
        title: editTitle,
        content: editContent,
      });
      if (res.record.id !== editRecord.id) {
        await api.deleteWorkRecord(editRecord.id);
      }
      setEditRecord(null);
      if (record?.id === editRecord.id) {
        setRecord(res.record);
        setTargetDate(res.record.targetDate.slice(0, 10));
        setTitle(res.record.title);
        setContent(res.record.content);
      }
      await refreshRecent();
      toast(t("workbench.recordUpdated"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecord = async (target: WorkRecord) => {
    setSaving(true);
    try {
      await api.deleteWorkRecord(target.id);
      if (record?.id === target.id) {
        setRecord(null);
        setTitle("");
        setContent("");
      }
      await refreshRecent();
      toast(t("workbench.recordDeleted"), "success");
    } catch (error: any) {
      toast(error.message || t("workbench.recordDeleteFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyFilters = async () => {
    if (dateFromDraft && dateToDraft && dateFromDraft > dateToDraft) {
      toast(t("workbench.invalidDateRange"), "error");
      return;
    }
    setFilterLoading(true);
    try {
      setSearchQuery(searchDraft);
      setDateFrom(dateFromDraft);
      setDateTo(dateToDraft);
      await refreshRecent();
    } finally {
      setFilterLoading(false);
    }
  };

  const handleResetFilters = async () => {
    setFilterLoading(true);
    try {
      setSearchDraft("");
      setDateFromDraft("");
      setDateToDraft("");
      setSearchQuery("");
      setDateFrom("");
      setDateTo("");
      await refreshRecent();
    } finally {
      setFilterLoading(false);
    }
  };

  const handlePasteImage = (file?: File) => {
    if (!file) return;
    if (file.size > MAX_INLINE_IMAGE_SIZE) {
      toast(t("editor.imageTooBig"), "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:image/")) return;
      const imageHtml = `<img src="${src}" alt="${file.name}" width="480" />`;
      const textarea = contentTextareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        setContent((value) => `${value.slice(0, start)}\n\n${imageHtml}\n\n${value.slice(end)}`);
        requestAnimationFrame(() => {
          const nextCursor = start + imageHtml.length + 4;
          textarea.focus();
          textarea.setSelectionRange(nextCursor, nextCursor);
        });
      } else {
        setContent((value) => `${value.trimEnd()}\n\n${imageHtml}\n`);
      }
      toast(t("workbench.imageAttached"), "success");
    };
    reader.readAsDataURL(file);
  };

  const currentPreview = stripMarkdown(content);
  const renderedPreviewHtml = useMemo(() => sanitizeHtml(marked.parse(content || "") as string), [content]);
  const currentTargetDate = record?.targetDate.slice(0, 10) || targetDate;
  const currentPeriodLabel = formatRecordDate(currentTargetDate, period);
  const contentChars = currentPreview.length;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return recentRecords.filter((item) => {
      const textMatch = !query || `${item.title} ${stripMarkdown(item.content)}`.toLowerCase().includes(query);
      const dateKey = getDateKey(item.targetDate);
      const afterFrom = !dateFrom || dateKey >= dateFrom;
      const beforeTo = !dateTo || dateKey <= dateTo;
      return textMatch && afterFrom && beforeTo;
    });
  }, [dateFrom, dateTo, recentRecords, searchQuery]);
  const hasListFilters = !!searchQuery || !!dateFrom || !!dateTo;
  const recentPreviewRecords = useMemo(() => recentRecords.slice(0, 5), [recentRecords]);

  return (
    <>
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
          <TabGroup
            items={periodItems}
            value={isListView ? listPeriod : period}
            onChange={isListView ? (value) => setListPeriod(value as WorkRecordPeriod) : handlePeriodChange}
          />
        </div>
      </div>

      {!isListView ? (
      <div className="grid gap-0 xl:grid-cols-[260px_minmax(0,1fr)]">
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
                <CountUp value={recentRecords.length} formatValue={(value) => numberFormatter.format(Math.round(value))} />
              </div>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white px-3 py-3 dark:border-surface-800 dark:bg-surface-950/25">
              <div className="flex items-center gap-1.5 text-[11px] text-surface-500 dark:text-surface-400">
                <BookOpenText className="h-3.5 w-3.5" />
                <span>{t("workbench.recordChars")}</span>
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                <CountUp value={contentChars} formatValue={(value) => numberFormatter.format(Math.round(value))} />
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

          <div className="mt-3 rounded-2xl border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950/25">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-900 dark:text-surface-100">
                  <NotebookTabs className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
                  <span>{t("workbench.recentRecords")}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-surface-500 dark:text-surface-400">
                  {t("workbench.recentRecordsDesc")}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-surface-100 px-2 py-1 text-[10px] font-medium text-surface-500 dark:bg-surface-800 dark:text-surface-300">
                {periodLabel}
              </span>
            </div>

            <div className="mt-3 grid gap-2">
              {recentPreviewRecords.length === 0 ? (
                <p className="rounded-xl border border-dashed border-surface-200 px-3 py-4 text-xs leading-5 text-surface-400 dark:border-surface-800">
                  {t("workbench.noRecentRecords")}
                </p>
              ) : (
                recentPreviewRecords.map((item) => {
                  const selected = record?.id === item.id;
                  const itemPreview = stripMarkdown(item.content) || t("workbench.recordContentPlaceholder");
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      aria-label={`${t("workbench.openRecordFromList")}: ${item.title}`}
                      onClick={() => handleSelectRecord(item)}
                      className={cn(
                        "h-auto w-full flex-col items-start justify-start gap-2 whitespace-normal rounded-xl border px-3 py-3 text-left",
                        selected
                          ? "border-brand-200 bg-brand-50/80 text-brand-900 hover:bg-brand-50 dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-100"
                          : "border-surface-200 bg-surface-50/70 text-surface-700 hover:bg-surface-100 dark:border-surface-800 dark:bg-surface-950/30 dark:text-surface-200 dark:hover:bg-surface-900"
                      )}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-semibold">{item.title}</span>
                        {selected ? (
                          <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-200">
                            {t("workbench.selectedRecord")}
                          </span>
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-surface-400" />
                        )}
                      </span>
                      <span className="line-clamp-2 text-[11px] font-normal leading-4 text-surface-500 dark:text-surface-400">
                        {itemPreview}
                      </span>
                      <span className="text-[10px] font-medium text-surface-400">
                        {formatRecordDate(item.targetDate, item.period)}{t("date.separator")}{formatUpdatedAt(item.updatedAt)}
                      </span>
                    </Button>
                  );
                })
              )}
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
            {content.trim() ? (
              <div
                className="work-record-markdown mt-3 min-h-[4.5rem] text-sm leading-6 text-surface-600 dark:text-surface-300"
                dangerouslySetInnerHTML={{ __html: renderedPreviewHtml }}
              />
            ) : (
              <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-surface-600 dark:text-surface-300">
                {t("workbench.emptySnapshot")}
              </p>
            )}
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
              <div className="grid gap-2">
                <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
                  {t("workbench.recordTitle")}
                </span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t("workbench.recordTitlePlaceholder")}
                  className="bg-surface-50 dark:bg-[#0f1724]"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
                    {t("workbench.recordContent")}
                  </span>
                  <span className="text-[11px] text-surface-400">{t("workbench.pasteImageHint")}</span>
                </div>
                <Textarea
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onPaste={(event) => {
                    const file = Array.from(event.clipboardData.files || []).find((item) => item.type.startsWith("image/"));
                    if (!file) return;
                    event.preventDefault();
                    handlePasteImage(file);
                  }}
                  placeholder={t("workbench.recordContentPlaceholder")}
                  className="min-h-[340px] bg-surface-50 leading-6 dark:bg-[#0f1724]"
                />
              </div>
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
      ) : (
        <aside className="bg-white p-5 dark:bg-[#0f1724] xl:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                {t("workbench.recordListTitle")}
              </h3>
              <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                {t("workbench.recordListDesc")}
              </p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-surface-400" />}
          </div>

          <div className="mb-4 grid gap-3 rounded-2xl border border-surface-200 bg-surface-50/70 p-3 dark:border-surface-800 dark:bg-surface-950/25">
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleApplyFilters();
                  }}
                  placeholder={t("workbench.searchRecords")}
                  className="h-10 bg-white pl-9 dark:bg-[#0f1724]"
                />
              </div>
              <DatePicker
                value={dateFromDraft}
                onChange={setDateFromDraft}
                placeholder={t("workbench.dateFrom")}
                ariaLabel={t("workbench.dateFrom")}
                className="w-full"
              />
              <DatePicker
                value={dateToDraft}
                onChange={setDateToDraft}
                placeholder={t("workbench.dateTo")}
                ariaLabel={t("workbench.dateTo")}
                className="w-full"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  className="h-10 gap-1.5 px-4"
                  onClick={handleApplyFilters}
                  disabled={loading || filterLoading}
                >
                  {filterLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span>{t("workbench.queryRecords")}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-1.5 px-3"
                  onClick={handleResetFilters}
                  disabled={loading || filterLoading || (!hasListFilters && !searchDraft && !dateFromDraft && !dateToDraft)}
                >
                  {filterLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  <span>{t("workbench.resetFilters")}</span>
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-800">
            {filteredRecords.length === 0 && !loading ? (
              <div className="px-4 py-8 text-center text-xs leading-5 text-surface-400">
                {t("workbench.noRecentRecords")}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-[980px] w-full table-fixed border-collapse text-left text-xs">
                <thead className="bg-surface-50 text-[11px] font-semibold text-surface-500 dark:bg-surface-950/35 dark:text-surface-400">
                  <tr>
                    <th className="w-[160px] px-4 py-3">{t("workbench.recordDate")}</th>
                    <th className="w-[220px] px-4 py-3">{t("workbench.recordTitle")}</th>
                    <th className="px-4 py-3">{t("workbench.recordPreview")}</th>
                    <th className="w-[150px] px-4 py-3">{t("workbench.recordCreatedAt")}</th>
                    <th className="w-[150px] px-4 py-3 text-right">{t("workbench.lastUpdated")}</th>
                    <th className="w-[132px] px-4 py-3 text-right">{t("workbench.recordActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-surface-800">
                  {filteredRecords.map((item) => {
                    const itemPreview = stripMarkdown(item.content) || t("workbench.recordContentPlaceholder");
                    const selected = record?.id === item.id;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleSelectRecord(item)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-brand-50/40 dark:hover:bg-brand-500/10",
                          selected && "bg-brand-50/70 dark:bg-brand-500/10"
                        )}
                      >
                        <td className="px-4 py-3 font-semibold text-brand-700 dark:text-brand-300">
                          <div className="flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5" />
                            <span className="truncate">{formatRecordDate(item.targetDate, item.period)}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-surface-950 dark:text-surface-50">
                          <div className="truncate">{item.title}</div>
                        </td>
                        <td className="px-4 py-3 text-surface-600 dark:text-surface-300">
                          <div className="line-clamp-2 leading-5">{itemPreview}</div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-surface-400">
                          {formatUpdatedAt(item.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-surface-400">
                          {formatUpdatedAt(item.updatedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("workbench.editRecord")}
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditRecord(item);
                              }}
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="text-surface-500 hover:text-red-600 dark:text-surface-400 dark:hover:text-red-300"
                              aria-label={t("common.delete")}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(item);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </aside>
      )}
    </section>
    <Dialog open={!!editRecord} onOpenChange={(open) => !open && setEditRecord(null)}>
      <DialogContent className="max-w-[720px]">
        <DialogTitle>{t("workbench.editRecord")}</DialogTitle>
        <DialogDescription>
          {t("workbench.editRecordDesc")}
        </DialogDescription>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
              {t("workbench.recordDate")}
            </span>
            <DatePicker
              value={editTargetDate}
              onChange={setEditTargetDate}
              placeholder={t("workbench.recordDate")}
              ariaLabel={t("workbench.recordDate")}
              className="w-full"
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
              {t("workbench.recordTitle")}
            </span>
            <Input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder={t("workbench.recordTitlePlaceholder")}
              className="bg-surface-50 dark:bg-[#0f1724]"
            />
          </div>
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">
              {t("workbench.recordContent")}
            </span>
            <Textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              placeholder={t("workbench.recordContentPlaceholder")}
              className="min-h-[300px] bg-surface-50 leading-6 dark:bg-[#0f1724]"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setEditRecord(null)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSaveEdit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>{t("common.save")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmModal
      open={!!deleteTarget}
      onOpenChange={(open) => !open && setDeleteTarget(null)}
      title={t("workbench.deleteRecordTitle")}
      description={t("workbench.deleteRecordDesc")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      variant="danger"
      onConfirm={() => {
        if (deleteTarget) handleDeleteRecord(deleteTarget);
        setDeleteTarget(null);
      }}
    />
    </>
  );
}
