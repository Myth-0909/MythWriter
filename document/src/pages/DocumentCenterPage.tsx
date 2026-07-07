import { useState, useEffect, useMemo, useRef } from "react";
import { DocumentCard } from "@/components/DocumentCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ConfirmModal";
import { LoadingOverlay } from "@/components/LoadingSpinner";
import { Scrollbar } from "@/components/ui/scrollbar";
import { WriterFlowChart } from "@/components/WriterFlowChart";
import { RotatingText } from "@/components/RotatingText";
import { CountUp } from "@/components/CountUp";
import {
  DocumentLifeline,
  type CreationWeatherTone,
  type DocumentLifelineStage,
} from "@/components/WorkbenchAtmosphere";
import { EmptyScene } from "@/components/AtmosphereShowcase";
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
  ClipboardCheck,
  Layers3,
  NotebookTabs,
  PenLine,
  Sparkles,
  SlidersHorizontal,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import mammoth from "mammoth";
import { marked } from "marked";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useAuth } from "@/auth";
import { useDocuments } from "@/store";
import { useToast } from "@/components/Toast";
import { api } from "@/api";
import { escapeHtml, sanitizeHtml } from "@/lib/html";
import { cn } from "@/lib/utils";
import { categoryLabels, type Document, type DocumentCategory, type WorkRecord } from "@/types";
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

function getDocumentText(doc?: Document | null) {
  if (!doc) return "";
  return (doc.preview || doc.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getPlainText(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLocalDateKey(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getGreetingKeys(hour: number): { title: TranslationKey; hint: TranslationKey } {
  if (hour < 12) {
    return { title: "workbench.greetingMorning", hint: "workbench.greetingMorningHint" };
  }
  if (hour < 18) {
    return { title: "workbench.greetingAfternoon", hint: "workbench.greetingAfternoonHint" };
  }
  return { title: "workbench.greetingEvening", hint: "workbench.greetingEveningHint" };
}

function summarizeWordsByDay(words: number[]) {
  const total = words.reduce((sum, value) => sum + value, 0);
  const activeDays = words.filter((value) => value > 0).length;
  const peakWords = words.reduce((max, value) => Math.max(max, value), 0);
  const averageWords = activeDays > 0 ? Math.round(total / activeDays) : 0;
  const bestDayIndex = words.reduce((bestIndex, value, index, values) => {
    if (value <= 0) return bestIndex;
    if (bestIndex === -1 || value > values[bestIndex]) return index;
    return bestIndex;
  }, -1);

  return { total, activeDays, peakWords, averageWords, bestDayIndex };
}

function getCreationWeatherProfile(input: {
  hasLatestDoc: boolean;
  todayTotal: number;
  latestWordEstimate: number;
  researchCount: number;
  ungroupedCount: number;
}): { tone: CreationWeatherTone; titleKey: TranslationKey; descKey: TranslationKey; intensity: number } {
  if (!input.hasLatestDoc && input.todayTotal <= 0) {
    return {
      tone: "blank",
      titleKey: "workbench.weather.blank.title",
      descKey: "workbench.weather.blank.desc",
      intensity: 14,
    };
  }

  if (input.todayTotal >= 800) {
    return {
      tone: "active",
      titleKey: "workbench.weather.active.title",
      descKey: "workbench.weather.active.desc",
      intensity: 86,
    };
  }

  if (input.todayTotal > 0) {
    return {
      tone: "steady",
      titleKey: "workbench.weather.steady.title",
      descKey: "workbench.weather.steady.desc",
      intensity: Math.min(76, 36 + Math.round(input.todayTotal / 24)),
    };
  }

  if ((input.researchCount > 0 || input.ungroupedCount > 0) && input.latestWordEstimate >= 300) {
    return {
      tone: "organize",
      titleKey: "workbench.weather.organize.title",
      descKey: "workbench.weather.organize.desc",
      intensity: 64,
    };
  }

  return {
    tone: "quiet",
    titleKey: "workbench.weather.quiet.title",
    descKey: "workbench.weather.quiet.desc",
    intensity: 30,
  };
}

function getDocumentLifelineProfile(input: {
  hasLatestDoc: boolean;
  wordEstimate: number;
  isUngrouped: boolean;
}): { stage: DocumentLifelineStage; titleKey: TranslationKey; descKey: TranslationKey; progress: number } {
  if (!input.hasLatestDoc) {
    return {
      stage: "empty",
      titleKey: "workbench.lifeline.empty.title",
      descKey: "workbench.lifeline.empty.desc",
      progress: 8,
    };
  }

  if (input.isUngrouped && input.wordEstimate >= 300) {
    return {
      stage: "organize",
      titleKey: "workbench.lifeline.organize.title",
      descKey: "workbench.lifeline.organize.desc",
      progress: 58,
    };
  }

  if (input.wordEstimate < 120) {
    return {
      stage: "seed",
      titleKey: "workbench.lifeline.seed.title",
      descKey: "workbench.lifeline.seed.desc",
      progress: 20,
    };
  }

  if (input.wordEstimate < 800) {
    return {
      stage: "forming",
      titleKey: "workbench.lifeline.forming.title",
      descKey: "workbench.lifeline.forming.desc",
      progress: 48,
    };
  }

  if (input.wordEstimate < 1800) {
    return {
      stage: "polish",
      titleKey: "workbench.lifeline.polish.title",
      descKey: "workbench.lifeline.polish.desc",
      progress: 74,
    };
  }

  return {
    stage: "settle",
    titleKey: "workbench.lifeline.settle.title",
    descKey: "workbench.lifeline.settle.desc",
    progress: 92,
  };
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
  const { user } = useAuth();
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
  const [chartData, setChartData] = useState<{ dayIndices: number[]; dates: string[]; words: number[] }>({
    dayIndices: [],
    dates: [],
    words: [],
  });
  const [workRecords, setWorkRecords] = useState<WorkRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const greeting = useMemo(() => getGreetingKeys(new Date().getHours()), []);
  const greetingName = user?.name?.trim() || t("workbench.defaultName");
  const todayDayIndex = useMemo(() => new Date().getDay(), []);
  const todayWeekday = useMemo(() => t(dayI18nKeys[todayDayIndex]), [t, todayDayIndex]);
  const todayVibeKey = useMemo((): TranslationKey => {
    const vibeKeys: Record<number, TranslationKey> = {
      1: "workbench.mondayVibe",
      2: "workbench.tuesdayVibe",
      3: "workbench.wednesdayVibe",
      4: "workbench.thursdayVibe",
      5: "workbench.fridayVibe",
      6: "workbench.saturdayVibe",
      0: "workbench.sundayVibe",
    };
    return vibeKeys[todayDayIndex] || "workbench.mondayVibe";
  }, [todayDayIndex]);

  useEffect(() => {
    api.getWeeklyStats()
      .then((res) => {
        setChartData({
          dayIndices: res.stats.map((s) => s.dayIndex),
          dates: res.stats.map((s) => s.date),
          words: res.stats.map((s) => s.words),
        });
      })
      .catch(() => {});
  }, [documents]);

  useEffect(() => {
    if (!isWorkbench) return;
    api.listWorkRecords({ limit: 100 })
      .then((res) => setWorkRecords(res.records || []))
      .catch(() => setWorkRecords([]));
  }, [isWorkbench]);

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
  const latestDocGroup = latestDoc?.groupId ? groups.find((group) => group.id === latestDoc.groupId) : null;
  const journalWordsByDay = chartData.dates.map((dateKey) =>
    workRecords
      .filter((item) => getLocalDateKey(item.targetDate) === dateKey)
      .reduce((sum, item) => sum + getPlainText(item.content).length, 0)
  );
  const weeklyTotal = chartData.words.reduce((sum, value) => sum + value, 0);
  const journalWeeklyTotal = journalWordsByDay.reduce((sum, value) => sum + value, 0);
  const documentFlowStats = summarizeWordsByDay(chartData.words);
  const journalFlowStats = summarizeWordsByDay(journalWordsByDay);
  const getBestDayLabel = (bestDayIndex: number) =>
    bestDayIndex >= 0 ? t(dayI18nKeys[chartData.dayIndices[bestDayIndex]]) : t("documents.noActivity");
  const latestText = getDocumentText(latestDoc);
  const latestWordEstimate = latestText.length;
  const latestDocumentDayWords = chartData.words[chartData.words.length - 1] || 0;
  const focusDetails = [
    {
      icon: Clock3,
      label: t("documents.focusUpdated"),
      value: latestDoc ? formatRelativeModified(latestDoc.updatedAt, t) : t("documents.noLatestDoc"),
    },
    {
      icon: FolderOpen,
      label: t("documents.focusGroup"),
      value: latestDoc ? latestDocGroup?.name || t("group.ungrouped") : t("documents.noLatestDoc"),
    },
    {
      icon: FileStack,
      label: t("documents.focusType"),
      value: latestDoc ? categoryLabels[latestDoc.category][lang] : categoryLabels.general[lang],
    },
    {
      icon: Target,
      label: t("documents.focusStatus"),
      value: latestDoc ? t("documents.focusStatusReady") : t("documents.focusStatusEmpty"),
    },
  ];
  const ungroupedCount = documents.filter((doc) => !doc.groupId).length;
  const researchCount = documents.filter((doc) => doc.category === "research").length;
  const sortedWorkRecords = useMemo(
    () => [...workRecords].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [workRecords]
  );
  const latestWorkRecord = sortedWorkRecords[0] ?? null;
  const workRecordTextTotal = workRecords.reduce((sum, item) => sum + getPlainText(item.content).length, 0);
  const todayWorkRecordWords = workRecords
    .filter((item) => getLocalDateKey(item.targetDate) === getLocalDateKey())
    .reduce((sum, item) => sum + getPlainText(item.content).length, 0);
  const latestWorkRecordText = getPlainText(latestWorkRecord?.content || "");
  const todayCreativeWords = latestDocumentDayWords + todayWorkRecordWords;
  const creationWeatherProfile = getCreationWeatherProfile({
    hasLatestDoc: !!latestDoc,
    todayTotal: todayCreativeWords,
    latestWordEstimate,
    researchCount,
    ungroupedCount,
  });
  const documentLifelineProfile = getDocumentLifelineProfile({
    hasLatestDoc: !!latestDoc,
    wordEstimate: latestWordEstimate,
    isUngrouped: !!latestDoc && !latestDoc.groupId,
  });
  const clampedWeatherIntensity = Math.max(0, Math.min(100, creationWeatherProfile.intensity));
  const weeklyCreativeWords = weeklyTotal + journalWeeklyTotal;
  const todayShareOfWeek = weeklyCreativeWords > 0
    ? Math.max(6, Math.min(100, Math.round((todayCreativeWords / weeklyCreativeWords) * 100)))
    : 0;
  const lifelineSteps = [
    t("workbench.lifeline.stepStart"),
    t("workbench.lifeline.stepShape"),
    t("workbench.lifeline.stepPolish"),
    t("workbench.lifeline.stepSettle"),
  ];
  const lifelineTags = latestDoc
    ? [
        formatRelativeModified(latestDoc.updatedAt, t),
        latestDoc.groupId ? t("workbench.lifeline.grouped") : t("workbench.lifeline.ungrouped"),
        t("workbench.lifeline.aiReady"),
      ]
    : [];
  const aiWorkbenchActions = useMemo(() => {
    const actions: {
      icon: LucideIcon;
      title: string;
      desc: string;
      action: string;
      score: number;
      onClick?: () => void;
    }[] = [];

    if (latestDoc) {
      actions.push({
        icon: Sparkles,
        title: t("documents.aiContinue"),
        desc: t("documents.nextContinueDesc").replace("{title}", latestDoc.title || t("editor.untitled")),
        action: t("documents.openAiWriting"),
        score: 96,
        onClick: onOpenAgentWrite,
      });
    } else {
      actions.push({
        icon: PenLine,
        title: t("documents.aiOutline"),
        desc: t("documents.aiOutlineDesc"),
        action: t("documents.openAiWriting"),
        score: 94,
        onClick: onOpenAgentWrite,
      });
    }

    if (latestDoc && latestWordEstimate < 800) {
      actions.push({
        icon: ClipboardCheck,
        title: t("documents.aiExpandDraft"),
        desc: t("documents.aiExpandDraftDesc"),
        action: t("documents.openAiWriting"),
        score: 88,
        onClick: onOpenAgentWrite,
      });
    }

    if (ungroupedCount > 0) {
      actions.push({
        icon: FolderOpen,
        title: t("documents.aiContextOrganize"),
        desc: t("documents.aiContextOrganizeDesc"),
        action: t("documents.librarySection"),
        score: 82,
        onClick: () => setActiveGroupId(null),
      });
    }

    if (researchCount > 0) {
      actions.push({
        icon: Layers3,
        title: t("documents.aiResearchDigest"),
        desc: t("documents.aiResearchDigestDesc"),
        action: t("documents.openAiWriting"),
        score: 78,
        onClick: onOpenAgentWrite,
      });
    }

    if (workRecordTextTotal > 0) {
      actions.push({
        icon: NotebookTabs,
        title: t("documents.aiReviewRhythm"),
        desc: t("documents.aiReviewRhythmDesc"),
        action: t("documents.openAiWriting"),
        score: 74,
        onClick: onOpenAgentWrite,
      });
    }

    if (latestDoc) {
      actions.push({
        icon: Brain,
        title: t("documents.aiSettingGap"),
        desc: t("documents.aiBrainDynamicDesc"),
        action: t("documents.openBrain"),
        score: 70,
        onClick: onOpenBrain,
      });
    }

    return actions.sort((a, b) => b.score - a.score).slice(0, 4);
  }, [latestDoc, latestWordEstimate, onOpenAgentWrite, onOpenBrain, researchCount, t, ungroupedCount, workRecordTextTotal]);
  const greetingRotations = useMemo(
    () => [
      t("documents.greetingRotateDraft"),
      t("documents.greetingRotateWorld"),
      t("documents.greetingRotateSpark"),
      t("documents.greetingRotateReview"),
    ],
    [t]
  );
  const greetingLines = useMemo(
    () => [
      t(greeting.title).replace("{name}", greetingName),
      t("workbench.greetingHeroOne").replace("{name}", greetingName),
      t("workbench.greetingHeroTwo"),
      `${todayWeekday}，${t(todayVibeKey)}`,
      t("workbench.greetingHeroThree"),
      t("workbench.greetingHeroFour"),
      t("workbench.greetingHeroFive"),
      t("workbench.greetingHeroSix"),
    ],
    [greeting.title, greetingName, t, todayWeekday, todayVibeKey]
  );
  const creativeSignals = [
    { icon: BarChart3, label: t("documents.signalDocumentWeeklyWords"), value: weeklyTotal, unit: t("documents.wordsUnit") },
    { icon: FileText, label: t("documents.signalLatestWords"), value: latestWordEstimate, unit: t("documents.wordsUnit") },
    { icon: NotebookTabs, label: t("documents.signalJournalWords"), value: workRecordTextTotal, unit: t("documents.wordsUnit") },
    { icon: Clock3, label: t("documents.signalTodayJournalWords"), value: todayWorkRecordWords, unit: t("documents.wordsUnit") },
  ];
  const contextBoardCards = [
    {
      icon: FileText,
      label: t("documents.contextLatestDraft"),
      title: latestDoc?.title || t("documents.noLatestDoc"),
      desc: latestText || t("documents.contextNoDraft"),
      value: latestWordEstimate,
      unit: t("documents.wordsUnit"),
    },
    {
      icon: NotebookTabs,
      label: t("documents.contextLatestEntry"),
      title: latestWorkRecord?.title || t("documents.recordSignalEmpty"),
      desc: latestWorkRecordText || t("documents.contextNoEntry"),
      value: latestWorkRecordText.length,
      unit: t("documents.wordsUnit"),
    },
    {
      icon: Clock3,
      label: t("documents.contextTodayProgress"),
      title: `${numberFormatter.format(todayWorkRecordWords + latestDocumentDayWords)} ${t("documents.wordsUnit")}`,
      desc: `${t("documents.signalDocumentWeeklyWords")} ${numberFormatter.format(latestDocumentDayWords)}${t("documents.wordsUnit")}${t("date.separator")}${t("documents.signalTodayJournalWords")} ${numberFormatter.format(todayWorkRecordWords)}${t("documents.wordsUnit")}`,
      value: todayWorkRecordWords + latestDocumentDayWords,
      unit: t("documents.wordsUnit"),
    },
    {
      icon: Sparkles,
      label: t("documents.contextNextMove"),
      title: aiWorkbenchActions[0]?.title || t("documents.aiOutline"),
      desc: aiWorkbenchActions[0]?.desc || t("documents.aiOutlineDesc"),
      value: aiWorkbenchActions.length,
      unit: t("documents.items"),
    },
  ];
  const flowPanels: {
    key: "document" | "journal";
    title: string;
    icon: LucideIcon;
    words: number[];
    total: number;
    stats: ReturnType<typeof summarizeWordsByDay>;
    tone: "document" | "journal";
    label: string;
  }[] = [
    {
      key: "document",
      title: t("documents.documentFlow"),
      icon: FileText,
      words: chartData.words,
      total: weeklyTotal,
      stats: documentFlowStats,
      tone: "document",
      label: t("chart.documentWords"),
    },
    {
      key: "journal",
      title: t("documents.journalFlow"),
      icon: NotebookTabs,
      words: journalWordsByDay,
      total: journalWeeklyTotal,
      stats: journalFlowStats,
      tone: "journal",
      label: t("chart.journalWords"),
    },
  ];

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
      {(loading || actionLoading) && (
        <LoadingOverlay message={loading ? t("loading.documents") : t("loading.documentAction")} />
      )}
      <div className="mx-auto w-full max-w-[1360px] px-8 py-8 xl:px-10">
        <div className={cn("grid gap-5", isWorkbench ? "xl:grid-cols-[minmax(0,1.25fr)_440px]" : "grid-cols-1")}>
          <section className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-7 shadow-sm dark:border-surface-800 dark:bg-[#101826]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(185,149,78,0.13),transparent_34%),linear-gradient(90deg,rgba(15,23,42,0.028)_1px,transparent_1px),linear-gradient(0deg,rgba(15,23,42,0.028)_1px,transparent_1px)] bg-[size:auto,32px_32px,32px_32px] dark:bg-[radial-gradient(circle_at_12%_0%,rgba(185,149,78,0.16),transparent_32%),linear-gradient(90deg,rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.035)_1px,transparent_1px)]" />
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

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,.doc"
                className="hidden"
                onChange={handleImport}
              />

              {isWorkbench ? (
                <>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{t("documents.workbenchHeroMode")}</span>
                  </div>
                  <div className="grid gap-6">
                    <div className="min-w-0">
                      <h1 className="max-w-[760px] pb-2 text-[34px] font-semibold leading-[1.16] text-surface-950 dark:text-surface-50 xl:text-[42px]">
                        <RotatingText
                          texts={greetingLines}
                          interval={2800}
                          className="min-h-[1.24em]"
                        />
                      </h1>
                      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2 text-[22px] font-semibold leading-tight text-surface-800 dark:text-surface-100 xl:text-[28px]">
                        <span>{t("documents.workbenchHeroPrefix")}</span>
                        <RotatingText
                          texts={greetingRotations}
                          interval={2400}
                          className="rounded-2xl border border-brand-200/70 bg-brand-50 px-3 py-1 text-brand-700 shadow-sm dark:border-brand-500/25 dark:bg-brand-500/10 dark:text-brand-200"
                        />
                      </div>
                      <p className="mt-4 max-w-[720px] text-sm leading-6 text-surface-500 dark:text-surface-400">
                        {t("documents.workbenchHeroDesc")}
                      </p>

                      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="relative h-full overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-50 via-white to-surface-50 p-4 shadow-sm dark:border-brand-500/25 dark:from-brand-500/15 dark:via-surface-950/55 dark:to-surface-900/70">
                          <div className="relative flex h-full min-h-[300px] flex-col">
                            <div className="flex flex-1 flex-col">
                              <div className="flex items-center gap-3">
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200/70 dark:bg-surface-950/55 dark:text-brand-200 dark:ring-brand-500/20">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  <span>{t("documents.currentFocus")}</span>
                                </div>
                              </div>
                              <h2 className="mt-4 break-words text-xl font-semibold leading-snug text-surface-950 dark:text-surface-50">
                                {latestDoc?.title || t("documents.noLatestDoc")}
                              </h2>
                              <p className="mt-2 line-clamp-3 max-w-[620px] text-sm leading-6 text-surface-600 dark:text-surface-300">
                                {latestText || t("documents.noDraftHint")}
                              </p>
                              <DocumentLifeline
                                label={t("workbench.lifeline.label")}
                                stage={documentLifelineProfile.stage}
                                title={t(documentLifelineProfile.titleKey)}
                                description={t(documentLifelineProfile.descKey)}
                                progress={documentLifelineProfile.progress}
                                steps={lifelineSteps}
                                tags={lifelineTags}
                                className="mt-4"
                              />
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                {focusDetails.map((item) => (
                                  <div
                                    key={item.label}
                                    className="min-w-0 rounded-xl border border-surface-200/80 bg-white/60 px-3 py-3 dark:border-surface-700/80 dark:bg-surface-950/35"
                                  >
                                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-surface-500 dark:text-surface-400">
                                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="min-w-0">{item.label}</span>
                                    </div>
                                    <div className="mt-2 break-words text-sm font-semibold text-surface-950 dark:text-surface-50">
                                      {item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Button
                                type="button"
                                className="h-10 min-w-0 justify-center gap-1.5 px-3"
                                onClick={() => latestDoc ? onOpenDoc?.(latestDoc.id) : handleNewDocument("general")}
                              >
                                <PenLine className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 truncate whitespace-nowrap">{latestDoc ? t("documents.openLatest") : t("documents.createFirstDraft")}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-10 min-w-0 justify-center gap-1.5 bg-white/65 px-3 dark:bg-surface-950/35"
                                onClick={onOpenAgentWrite}
                              >
                                <Sparkles className="h-4 w-4 shrink-0" />
                                <span className="min-w-0 truncate whitespace-nowrap">{t("documents.aiAssistNow")}</span>
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white/75 p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950/35">
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/70 to-transparent dark:via-brand-400/45" />
                          <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                              {t("documents.signalPanel")}
                            </h2>
                            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                              {t("documents.signalReady")}
                            </span>
                          </div>
                          <div className="mt-4 rounded-xl border border-brand-200/70 bg-brand-50/70 p-3 dark:border-brand-500/20 dark:bg-brand-500/10">
                            <div className="flex items-start gap-2.5">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm ring-1 ring-brand-200/70 dark:bg-surface-950/45 dark:text-brand-300 dark:ring-brand-500/20">
                                <Sparkles className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">
                                  {t("workbench.weather.label")}
                                </p>
                                <h3 className="mt-0.5 break-words text-sm font-semibold leading-snug text-surface-950 dark:text-surface-50">
                                  {t(creationWeatherProfile.titleKey)}
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                                  {t(creationWeatherProfile.descKey)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-900">
                              <div
                                className="h-full rounded-full bg-brand-400 dark:bg-brand-300"
                                style={{ width: `${clampedWeatherIntensity}%` }}
                              />
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {creativeSignals.map((signal) => (
                              <div
                                key={signal.label}
                                className="min-w-0 rounded-xl border border-surface-200 bg-surface-50/75 p-3 dark:border-surface-800 dark:bg-surface-900/45"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="min-w-0 text-[11px] font-medium leading-4 text-surface-500 dark:text-surface-400">{signal.label}</span>
                                  <signal.icon className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                                </div>
                                <div className="mt-2 flex items-baseline gap-1.5">
                                  <CountUp
                                    value={signal.value}
                                    formatValue={(value) => numberFormatter.format(Math.round(value))}
                                    className="text-xl font-semibold tabular-nums text-surface-950 dark:text-surface-50"
                                  />
                                  <span className="text-[11px] font-medium text-surface-400">{signal.unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 rounded-xl border border-surface-200 bg-white/70 p-3 dark:border-surface-800 dark:bg-surface-900/45">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400">
                                {t("documents.contextTodayProgress")}
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                                <CountUp value={todayCreativeWords} formatValue={(value) => numberFormatter.format(Math.round(value))} /> {t("documents.wordsUnit")}
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
                              <div
                                className="h-full rounded-full bg-brand-400 dark:bg-brand-300"
                                style={{ width: `${todayShareOfWeek}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-medium text-surface-400">
                              <span>{t("workbench.weather.weeklyTotal")}</span>
                              <span>{numberFormatter.format(weeklyCreativeWords)} {t("documents.wordsUnit")}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-surface-200 bg-white/70 p-3 shadow-sm dark:border-surface-800 dark:bg-surface-950/35">
                        <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1">
                          <div>
                            <h2 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                              {t("documents.recordSignalPanel")}
                            </h2>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-surface-500 dark:text-surface-400">{t("documents.recordSignalDesc")}</p>
                          </div>
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                            <NotebookTabs className="h-[18px] w-[18px]" />
                          </div>
                        </div>
                        <div className="mt-1 grid gap-2 sm:grid-cols-3">
                          {[
                            { icon: NotebookTabs, label: t("documents.signalJournalEntries"), value: workRecords.length, unit: t("documents.items") },
                            { icon: FileText, label: t("documents.signalJournalWords"), value: workRecordTextTotal, unit: t("documents.wordsUnit") },
                            { icon: Clock3, label: t("documents.signalTodayJournalWords"), value: todayWorkRecordWords, unit: t("documents.wordsUnit") },
                          ].map((item) => (
                            <div key={item.label} className="rounded-xl border border-surface-200 bg-surface-50/70 px-3 py-3 dark:border-surface-800 dark:bg-surface-900/45">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-surface-500 dark:text-surface-400">{item.label}</span>
                                <item.icon className="h-3.5 w-3.5 text-brand-500" />
                              </div>
                              <div className="mt-1 flex items-baseline gap-1.5">
                                <CountUp value={item.value} formatValue={(value) => numberFormatter.format(Math.round(value))} className="text-xl font-semibold text-surface-950 dark:text-surface-50" />
                                <span className="text-[11px] text-surface-400">{item.unit}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 rounded-xl border border-surface-200 bg-white/70 px-3 py-3 dark:border-surface-800 dark:bg-surface-950/35">
                          <div className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">{t("documents.recordSignalLatest")}</div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-surface-700 dark:text-surface-200">
                            {latestWorkRecord ? `${latestWorkRecord.title}${t("date.separator")}${latestWorkRecordText || t("documents.recordSignalEmpty")}` : t("documents.recordSignalEmpty")}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-2xl border border-surface-200 bg-white/70 p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950/35">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h2 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                              {t("documents.contextBoard")}
                            </h2>
                            <p className="mt-1 max-w-[620px] text-xs leading-5 text-surface-500 dark:text-surface-400">
                              {t("documents.contextBoardDesc")}
                            </p>
                          </div>
                          <div className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                            {t("documents.signalNext")}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {contextBoardCards.map((item) => (
                            <div
                              key={item.label}
                              className="min-w-0 rounded-xl border border-surface-200 bg-surface-50/75 p-3 dark:border-surface-800 dark:bg-surface-900/45"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600 ring-1 ring-surface-200 dark:bg-surface-950/45 dark:text-brand-300 dark:ring-surface-800">
                                    <item.icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-[11px] font-medium text-surface-500 dark:text-surface-400">{item.label}</div>
                                    <div className="mt-0.5 truncate text-sm font-semibold text-surface-950 dark:text-surface-50">{item.title}</div>
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <CountUp value={item.value} formatValue={(value) => numberFormatter.format(Math.round(value))} className="text-lg font-semibold text-surface-950 dark:text-surface-50" />
                                  <div className="text-[10px] text-surface-400">{item.unit}</div>
                                </div>
                              </div>
                              <p className="mt-3 line-clamp-2 text-xs leading-5 text-surface-600 dark:text-surface-300">
                                {item.desc}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-8">
                    <div className="min-w-0">
                      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>{t("documents.librarySection")}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {activeGroupId && (
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
                      { icon: FileStack, label: t("documents.totalDocs"), value: documents.length },
                      { icon: Star, label: t("documents.favoriteDocs"), value: favorites.length },
                      { icon: FolderOpen, label: t("documents.groupCount"), value: groups.length },
                      { icon: BarChart3, label: t("documents.weeklyWords"), value: weeklyTotal },
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
                          <CountUp value={metric.value} formatValue={(v) => numberFormatter.format(Math.round(v))} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
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
              </div>
              {chartData.dayIndices.length > 0 ? (
                <div className="grid gap-4">
                  {flowPanels.map((flow) => (
                    <div
                      key={flow.key}
                      className={cn(
                        "rounded-xl border bg-surface-50/75 p-4 dark:bg-surface-950/35",
                        flow.key === "journal"
                          ? "border-teal-200/70 dark:border-teal-500/20"
                          : "border-brand-200/70 dark:border-brand-500/20"
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-xl",
                              flow.key === "journal"
                                ? "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300"
                                : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            )}
                          >
                            <flow.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-surface-950 dark:text-surface-50">{flow.title}</div>
                            <div className="mt-0.5 text-[11px] text-surface-400">
                              {t("documents.flowTotal")} · <CountUp value={flow.total} formatValue={(v) => numberFormatter.format(Math.round(v))} /> {t("documents.wordsUnit")}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-surface-200 bg-white px-3 py-2 text-right dark:border-surface-800 dark:bg-surface-900">
                          <div className="text-[11px] text-surface-400">{t("documents.bestDay")}</div>
                          <div className="mt-0.5 text-sm font-semibold text-surface-800 dark:text-surface-100">
                            {getBestDayLabel(flow.stats.bestDayIndex)}
                          </div>
                        </div>
                      </div>
                      <WriterFlowChart dayIndices={chartData.dayIndices} words={flow.words} height={154} tone={flow.tone} label={flow.label} />
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { label: t("documents.activeDays"), value: flow.stats.activeDays, suffix: ` ${t("documents.daysUnit")}` },
                          { label: t("documents.averageWords"), value: flow.stats.averageWords, suffix: "" },
                          { label: t("documents.peakWords"), value: flow.stats.peakWords, suffix: "" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl border border-surface-200 bg-white px-3 py-3 dark:border-surface-800 dark:bg-surface-900"
                          >
                            <div className="whitespace-nowrap text-[11px] font-medium text-surface-500 dark:text-surface-400">{item.label}</div>
                            <div className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                              <CountUp value={item.value} formatValue={(v) => numberFormatter.format(Math.round(v))} />
                              {item.suffix}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 rounded-xl border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-900">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("documents.weeklyTrack")}</span>
                          <span className="text-[11px] text-surface-400">
                            <CountUp value={flow.total} formatValue={(v) => numberFormatter.format(Math.round(v))} /> {t("documents.wordsUnit")}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-7 gap-1.5">
                          {chartData.dayIndices.map((dayIndex, index) => {
                            const dayWords = flow.words[index] || 0;
                            const intensity = flow.stats.peakWords > 0 ? Math.max(18, Math.round((dayWords / flow.stats.peakWords) * 100)) : 0;

                            return (
                              <div
                                key={`${flow.key}-${dayIndex}-${index}`}
                                className={cn(
                                  "min-w-0 rounded-lg border px-1.5 py-2 text-center",
                                  dayWords > 0
                                    ? flow.key === "journal"
                                      ? "border-teal-200 bg-teal-50/70 dark:border-teal-500/20 dark:bg-teal-500/10"
                                      : "border-brand-200 bg-brand-50/70 dark:border-brand-500/20 dark:bg-brand-500/10"
                                    : "border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-950/50"
                                )}
                              >
                                <div className="truncate text-[10px] font-medium text-surface-500 dark:text-surface-400">{t(dayI18nKeys[dayIndex])}</div>
                                <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800">
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      flow.key === "journal" ? "bg-teal-400 dark:bg-teal-300" : "bg-brand-400 dark:bg-brand-300"
                                    )}
                                    style={{ width: `${intensity}%` }}
                                  />
                                </div>
                                <div className="mt-1.5 truncate text-[11px] font-semibold tabular-nums text-surface-800 dark:text-surface-100">
                                  <CountUp value={dayWords} formatValue={(v) => numberFormatter.format(Math.round(v))} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {[
                            {
                              label: t("documents.quietDays"),
                              value: Math.max(chartData.dayIndices.length - flow.stats.activeDays, 0),
                              suffix: ` ${t("documents.daysUnit")}`,
                            },
                            {
                              label: t("documents.activeShare"),
                              value: Math.round((flow.stats.activeDays / Math.max(chartData.dayIndices.length, 1)) * 100),
                              suffix: "%",
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-950/45"
                            >
                              <div className="text-[11px] font-medium text-surface-500 dark:text-surface-400">{item.label}</div>
                              <div className="mt-1 text-base font-semibold tabular-nums text-surface-950 dark:text-surface-50">
                                <CountUp value={item.value} formatValue={(v) => numberFormatter.format(Math.round(v))} />
                                {item.suffix}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[336px] flex-1 items-center justify-center rounded-xl border border-dashed border-surface-200 text-xs text-surface-400 dark:border-surface-800">
                  {t("documents.noActivity")}
                </div>
              )}
            </section>
          )}
        </div>

        {isWorkbench && (
          <section className="mt-5 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                  <Bot className="h-3.5 w-3.5" />
                  <span>{t("documents.aiJudgementBadge")}</span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-surface-950 dark:text-surface-50">
                  {t("documents.aiWorkbench")}
                </h2>
                <p className="mt-1 max-w-[760px] text-xs leading-5 text-surface-500 dark:text-surface-400">
                  {t("documents.aiWorkbenchDesc")}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              {aiWorkbenchActions.map((action, index) => (
                <button
                  key={action.title}
                  type="button"
                  onClick={action.onClick}
                  className={cn(
                    "group relative min-h-[176px] overflow-hidden rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]",
                    index === 0
                      ? "bg-surface-950 text-white shadow-sm dark:bg-black"
                      : "border border-surface-200 bg-surface-50/80 text-surface-950 hover:border-brand-300 hover:bg-white dark:border-surface-800 dark:bg-surface-950/40 dark:text-surface-50 dark:hover:border-brand-500/50 dark:hover:bg-surface-900"
                  )}
                >
                  {index === 0 && (
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(185,149,78,0.26),transparent_34%),radial-gradient(circle_at_82%_88%,rgba(15,23,42,0.55),transparent_38%)]" />
                  )}
                  <div className="relative flex h-full flex-col justify-between">
                    <div>
                      <div
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-xl",
                          index === 0
                            ? "bg-white/10 text-brand-200"
                            : "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                        )}
                      >
                        <action.icon className="h-[18px] w-[18px]" />
                      </div>
                      <h3 className={cn("mt-5 text-lg font-semibold leading-tight", index !== 0 && "text-surface-950 dark:text-surface-50")}>
                        {action.title}
                      </h3>
                      <p className={cn("mt-2 line-clamp-3 text-xs leading-5", index === 0 ? "text-surface-300" : "text-surface-500 dark:text-surface-400")}>
                        {action.desc}
                      </p>
                    </div>
                    <div className={cn("mt-5 flex items-center justify-between gap-3 text-xs font-semibold", index === 0 ? "text-brand-200" : "text-brand-600 dark:text-brand-300")}>
                      <span>{action.action}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={cn("rounded-md px-2 py-1 text-[11px]", index === 0 ? "bg-white/10" : "bg-white dark:bg-surface-950")}>
                          {t("documents.aiPriority")} {action.score}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {!isWorkbench && (
        <>
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
                <CountUp value={visibleDocsCount} formatValue={(v) => numberFormatter.format(Math.round(v))} />
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
                <CountUp value={favDocs.length} formatValue={(v) => numberFormatter.format(Math.round(v))} /> {t("documents.items")}
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
              <CountUp value={mainDocs.length} formatValue={(v) => numberFormatter.format(Math.round(v))} /> {t("documents.items")}
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
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[8px] border border-dashed border-surface-200 bg-white px-6 py-8 text-center dark:border-surface-800 dark:bg-surface-900">
              <EmptyScene
                variant="paper"
                title={emptyIsSearch ? t("documents.emptySearchTitle") : t("documents.emptyTitle")}
                description={emptyIsSearch ? t("documents.emptySearchDesc") : t("documents.emptyDesc")}
                compact
                className="min-h-[180px] border-0 bg-transparent p-0 dark:bg-transparent"
              />
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
        </>
        )}
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
