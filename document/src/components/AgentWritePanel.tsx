import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  NotebookTabs,
  PenLine,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import catAvatar from "@/assets/cat-avatar.png";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { markdownToHtml } from "@/lib/markdown";
import { sanitizeHtml } from "@/lib/html";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { cn } from "@/lib/utils";
import { streamAgentWrite, api, type AgentDoneEvent, type AgentProgressEvent, type AgentStage } from "@/api";

interface AgentWritePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDocument: (docId: string) => void;
  currentDocumentId?: string;
}

const stageOrder: AgentStage[] = ["analyze", "research", "plan", "draft", "review", "publish"];

const stageMeta: Record<AgentStage, { label: TranslationKey; icon: typeof Search }> = {
  analyze: { label: "agent.step.analyze", icon: Search },
  research: { label: "agent.step.research", icon: BookOpen },
  plan: { label: "agent.step.plan", icon: ClipboardCheck },
  draft: { label: "agent.step.draft", icon: FileText },
  review: { label: "agent.step.review", icon: CheckCircle2 },
  publish: { label: "agent.step.publish", icon: Send },
};

function sanitizeWordCount(value: string) {
  return value.replace(/\D/g, "").slice(0, 5);
}

export function AgentWritePanel({ open, onOpenChange, onOpenDocument, currentDocumentId }: AgentWritePanelProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refreshDocuments, documents: allDocuments } = useDocuments();
  const [goal, setGoal] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [wordCount, setWordCount] = useState("600");
  const [includeBrain, setIncludeBrain] = useState(false);
  const [includeDocuments, setIncludeDocuments] = useState(false);
  const [includeJournal, setIncludeJournal] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [selectedBrainIds, setSelectedBrainIds] = useState<string[]>([]);
  const [selectedJournalIds, setSelectedJournalIds] = useState<string[]>([]);
  const [brainKnowledges, setBrainKnowledges] = useState<{ id: string; title: string; description: string; category: string }[]>([]);
  const [journalRecords, setJournalRecords] = useState<{ id: string; title: string }[]>([]);
  const [docFilter, setDocFilter] = useState("");
  const [brainFilter, setBrainFilter] = useState("");
  const [journalFilter, setJournalFilter] = useState("");
  const [events, setEvents] = useState<Partial<Record<AgentStage, AgentProgressEvent>>>({});
  const [activeStage, setActiveStage] = useState<AgentStage | null>(null);
  const [done, setDone] = useState<AgentDoneEvent | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ goal?: string }>).detail;
      if (detail?.goal) setGoal(detail.goal);
      onOpenChange(true);
    };
    window.addEventListener("znwriter-agent-write-open", handler);
    return () => window.removeEventListener("znwriter-agent-write-open", handler);
  }, [onOpenChange]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Restore form draft from localStorage when opening
  useEffect(() => {
    if (!open) return;
    try {
      const saved = localStorage.getItem("agent-write-draft");
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.goal) setGoal(draft.goal);
        if (draft.stylePrompt) setStylePrompt(draft.stylePrompt);
        if (draft.wordCount) setWordCount(draft.wordCount);
      }
    } catch { /* ignore */ }
  }, [open]);

  // Auto-select current document when panel opens with includeDocuments
  useEffect(() => {
    if (open && currentDocumentId && includeDocuments && !selectedDocIds.includes(currentDocumentId)) {
      setSelectedDocIds((prev) => [...prev, currentDocumentId]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentDocumentId]);

  // Save form draft to localStorage (debounced)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("agent-write-draft", JSON.stringify({ goal, stylePrompt, wordCount }));
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [open, goal, stylePrompt, wordCount]);

  useEffect(() => {
    if (open && includeBrain) {
      api.listBrainKnowledges().then((res) => setBrainKnowledges(res.knowledges || []));
    }
  }, [open, includeBrain]);

  useEffect(() => {
    if (open && includeJournal) {
      api.listWorkRecords({ limit: 100 }).then((res) =>
        setJournalRecords((res.records || []).map((r: any) => ({ id: r.id, title: r.title })))
      );
    }
  }, [open, includeJournal]);

  const analysis = events.analyze?.analysis || done?.analysis;
  const sources = events.research?.sources || done?.sources || [];
  const outline = events.plan?.outline || done?.outline || [];
  const draftContent = (done?.content as string) || events.draft?.content || "";
  const review = events.review?.review || done?.review;
  const hasStarted = Boolean(activeStage || done || error || stopped || running);
  const activeStageIndex = activeStage ? stageOrder.indexOf(activeStage) : -1;

  const statusText = useMemo(() => {
    if (error) return error;
    if (done) return t("agent.complete");
    if (stopped) return t("agent.stopped");
    if (activeStage) return events[activeStage]?.message || t(stageMeta[activeStage].label);
    return t("agent.idle");
  }, [activeStage, done, error, events, stopped, t]);

  const resetFlow = () => {
    setEvents({});
    setActiveStage(null);
    setDone(null);
    setError("");
    setStopped(false);
    setSelectedDocIds([]);
    setSelectedBrainIds([]);
    setSelectedJournalIds([]);
  };

  const stopFlow = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveStage(null);
    setStopped(true);
    setRunning(false);
    toast(t("agent.stopped"), "info");
  };

  const validateWordCount = () => {
    if (!wordCount.trim()) {
      toast(t("agent.wordCountRequired"), "error");
      setError(t("agent.wordCountRequired"));
      return null;
    }

    if (!/^\d+$/.test(wordCount)) {
      toast(t("agent.wordCountInvalid"), "error");
      setError(t("agent.wordCountInvalid"));
      return null;
    }

    const targetWords = Number(wordCount);
    if (targetWords < 300 || targetWords > 8000) {
      toast(t("agent.wordCountRange"), "error");
      setError(t("agent.wordCountRange"));
      return null;
    }

    return targetWords;
  };

  const adjustWordCount = (delta: number) => {
    setWordCount((prev) => {
      const current = Number(sanitizeWordCount(prev)) || 600;
      const next = Math.min(8000, Math.max(300, current + delta));
      return String(next);
    });
  };

  const startFlow = async () => {
    if (!goal.trim()) {
      setError(t("agent.goalRequired"));
      toast(t("agent.goalRequired"), "error");
      return;
    }

    const targetWords = validateWordCount();
    if (!targetWords) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setStopped(false);
    resetFlow();

    try {
      await streamAgentWrite(
        {
          goal: goal.trim(),
          stylePrompt: stylePrompt.trim(),
          targetWords,
          includeBrain,
          includeDocuments,
          includeJournal,
          referenceDocIds: includeDocuments ? selectedDocIds : [],
          referenceBrainIds: includeBrain ? selectedBrainIds : [],
          referenceJournalIds: includeJournal ? selectedJournalIds : [],
        },
        {
          onProgress(event) {
            setActiveStage(event.stage);
            setEvents((prev) => ({ ...prev, [event.stage]: event }));
          },
          onDone(result) {
            setDone(result);
            setActiveStage("publish");
            refreshDocuments();
            toast(t("agent.complete"), "success");
          },
          onError(message) {
            setError(message);
          },
        },
        controller.signal
      );
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setStopped(true);
      } else {
        const message = err?.message || t("agent.failed");
        setError(message);
        toast(message, "error");
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  };

  const openGeneratedDocument = () => {
    if (!done?.docId) return;
    onOpenChange(false);
    onOpenDocument(done.docId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="relative h-[90vh] w-[calc(100vw-1rem)] max-w-[1280px] overflow-hidden p-0 sm:w-[calc(100vw-2rem)]"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("common.close")}
          className="absolute right-4 top-4 z-30 h-10 w-10 rounded-2xl border border-surface-200 bg-white/90 text-surface-500 shadow-sm backdrop-blur transition-all hover:bg-surface-100 hover:text-surface-950 dark:border-surface-700 dark:bg-surface-950/90 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-50"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4.5 w-4.5" />
        </Button>
        <div className="grid h-full min-h-0 grid-cols-1 bg-surface-50 dark:bg-surface-950 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-h-0 min-w-0 flex-col bg-white dark:bg-surface-950">
            <div className="relative overflow-hidden border-b border-surface-200 px-7 py-6 pr-20 dark:border-surface-800">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.14),transparent_30%),radial-gradient(circle_at_86%_22%,rgba(216,189,115,0.16),transparent_26%)]" />
              <div className="relative flex items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-950 text-brand-200 shadow-sm dark:bg-surface-100 dark:text-surface-950 overflow-hidden">
                    <img src={catAvatar} alt="AI" className="h-12 w-12 object-cover" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-2xl font-semibold text-surface-950 dark:text-surface-50">
                      {t("agent.title")}
                    </DialogTitle>
                    <DialogDescription className="mt-2 max-w-[620px] text-sm leading-6 text-surface-500 dark:text-surface-400">
                      {t("agent.subtitle")}
                    </DialogDescription>
                  </div>
                </div>
                {running && (
                  <div className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300">
                    {t("agent.backgroundRunning")}
                  </div>
                )}
              </div>
            </div>

            <Scrollbar className="min-h-0 flex-1">
              <div className="px-7 py-6">
                <section className="rounded-2xl border border-surface-200 bg-surface-50/70 p-6 dark:border-surface-800 dark:bg-surface-900/50">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      <PenLine className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                        {t("agent.formTitle")}
                      </h3>
                      <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                        {t("agent.formDesc")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                      <label className="mb-3 block text-xs font-semibold text-surface-600 dark:text-surface-300">
                        {t("agent.goalLabel")}
                      </label>
                      <Textarea
                        value={goal}
                        onChange={(event) => setGoal(event.target.value)}
                        placeholder={t("agent.goalPlaceholder")}
                        disabled={running}
                        className="min-h-36 rounded-xl bg-surface-50/80 text-sm leading-6 shadow-none dark:bg-surface-900"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                        <label className="mb-3 block text-xs font-semibold text-surface-600 dark:text-surface-300">
                          {t("agent.style")}
                        </label>
                        <Input
                          value={stylePrompt}
                          onChange={(event) => setStylePrompt(event.target.value)}
                          placeholder={t("agent.stylePlaceholder")}
                          disabled={running}
                          className="h-11 rounded-xl bg-surface-50/80 shadow-none dark:bg-surface-900"
                        />
                        {stylePrompt.length > 100 && (
                          <p className={cn(
                            "mt-2 text-[11px] leading-5",
                            stylePrompt.length > 120 ? "text-red-500 font-medium" : "text-amber-500"
                          )}>
                            {stylePrompt.length > 120
                              ? `${t("agent.styleTruncated")}（${stylePrompt.length}/120）`
                              : `${stylePrompt.length}/120`}
                          </p>
                        )}
                        {stylePrompt.length <= 100 && (
                          <p className="mt-2 text-[11px] leading-5 text-surface-400">{t("agent.styleHint")}</p>
                        )}
                      </div>

                      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                        <label className="mb-3 block text-xs font-semibold text-surface-600 dark:text-surface-300">
                          {t("agent.length")}
                        </label>
                        <div className="relative">
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            role="spinbutton"
                            aria-label={t("agent.length")}
                            aria-valuemin={300}
                            aria-valuemax={8000}
                            aria-valuenow={wordCount ? Number(wordCount) : undefined}
                            value={wordCount}
                            onChange={(event) => setWordCount(sanitizeWordCount(event.target.value))}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowUp") {
                                event.preventDefault();
                                adjustWordCount(100);
                                return;
                              }
                              if (event.key === "ArrowDown") {
                                event.preventDefault();
                                adjustWordCount(-100);
                                return;
                              }
                              if (
                                event.key.length === 1 &&
                                !/\d/.test(event.key) &&
                                !event.metaKey &&
                                !event.ctrlKey
                              ) {
                                event.preventDefault();
                              }
                            }}
                            placeholder={t("agent.wordCountPlaceholder")}
                            disabled={running}
                            className="h-11 rounded-xl bg-surface-50/80 pr-12 shadow-none dark:bg-surface-900"
                          />
                          <div className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-surface-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-950">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("agent.wordCountIncrease")}
                              disabled={running}
                              className="h-4 w-8 rounded-none p-0 text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-50"
                              onClick={() => adjustWordCount(100)}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("agent.wordCountDecrease")}
                              disabled={running}
                              className="h-4 w-8 rounded-none border-t border-surface-200 p-0 text-surface-500 hover:bg-surface-100 hover:text-surface-950 dark:border-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-50"
                              onClick={() => adjustWordCount(-100)}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-surface-400">{t("agent.wordCountHint")}</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="mt-5 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-800 dark:bg-surface-900">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                      {t("agent.contextTitle")}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                      {t("agent.contextDesc")}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* Brain Knowledge Picker */}
                    <div className={cn(
                      "rounded-xl border transition-all duration-200 overflow-hidden",
                      includeBrain
                        ? "border-brand-200 dark:border-brand-500/25 shadow-sm"
                        : "border-surface-200 dark:border-surface-800 hover:border-brand-200/50 hover:shadow-sm"
                    )}>
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => { setIncludeBrain(!includeBrain); if (includeBrain) { setSelectedBrainIds([]); setBrainFilter(""); } }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-xs font-medium transition-all duration-200 cursor-pointer",
                          includeBrain
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            : "text-surface-500 hover:bg-surface-50 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-900 dark:hover:text-surface-200"
                        )}
                      >
                        <BookOpen className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{t("agent.includeBrain")}</span>
                        <span className="text-[10px] text-surface-400">{selectedBrainIds.length > 0 ? selectedBrainIds.length : includeBrain ? t("agent.autoSelect") : t("agent.off")}</span>
                      </button>
                      {includeBrain && (
                        <div className="border-t border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-950/30">
                          {brainKnowledges.length > 0 && (
                            <div className="px-3 pt-2">
                              <Input
                                className="h-8 text-[11px] dark:bg-surface-900"
                                placeholder={t("agent.filterBrain")}
                                value={brainFilter}
                                onChange={(e) => setBrainFilter(e.target.value)}
                              />
                            </div>
                          )}
                          <div className="max-h-[140px] overflow-y-auto">
                            {brainKnowledges
                              .filter((item) => !brainFilter || item.title.includes(brainFilter) || item.category.includes(brainFilter))
                              .map((item) => (
                                <label
                                  key={item.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-surface-100 dark:hover:bg-surface-800",
                                    selectedBrainIds.includes(item.id) && "bg-brand-50/50 dark:bg-brand-500/5"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded accent-brand-500"
                                    checked={selectedBrainIds.includes(item.id)}
                                    onChange={(e) => {
                                      setSelectedBrainIds((prev) =>
                                        e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                                      );
                                    }}
                                  />
                                  <span className="truncate">{item.title}</span>
                                  <span className="ml-auto shrink-0 text-[10px] text-surface-400">{item.category}</span>
                                </label>
                              ))}
                          </div>
                          {brainKnowledges.length === 0 && (
                            <div className="px-4 py-3 text-[11px] text-surface-400">
                              {t("agent.noBrainEntries")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Document Picker */}
                    <div className={cn(
                      "rounded-xl border transition-all duration-200 overflow-hidden",
                      includeDocuments
                        ? "border-brand-200 dark:border-brand-500/25 shadow-sm"
                        : "border-surface-200 dark:border-surface-800 hover:border-brand-200/50 hover:shadow-sm"
                    )}>
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => { setIncludeDocuments(!includeDocuments); if (includeDocuments) { setSelectedDocIds([]); setDocFilter(""); } }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-xs font-medium transition-all duration-200 cursor-pointer",
                          includeDocuments
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            : "text-surface-500 hover:bg-surface-50 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-900 dark:hover:text-surface-200"
                        )}
                      >
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{t("agent.includeDocs")}</span>
                        <span className="text-[10px] text-surface-400">{selectedDocIds.length > 0 ? selectedDocIds.length : includeDocuments ? t("agent.autoSelect") : t("agent.off")}</span>
                      </button>
                      {includeDocuments && (
                        <div className="border-t border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-950/30">
                          {allDocuments.length > 0 && (
                            <div className="px-3 pt-2">
                              <Input
                                className="h-8 text-[11px] dark:bg-surface-900"
                                placeholder={t("agent.filterDocs")}
                                value={docFilter}
                                onChange={(e) => setDocFilter(e.target.value)}
                              />
                            </div>
                          )}
                          <div className="max-h-[140px] overflow-y-auto">
                            {allDocuments
                              .filter((d) => !d.isDeleted && (!docFilter || d.title.includes(docFilter)))
                              .map((doc) => (
                                <label
                                  key={doc.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-surface-100 dark:hover:bg-surface-800",
                                    selectedDocIds.includes(doc.id) && "bg-brand-50/50 dark:bg-brand-500/5"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded accent-brand-500"
                                    checked={selectedDocIds.includes(doc.id)}
                                    onChange={(e) => {
                                      setSelectedDocIds((prev) =>
                                        e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)
                                      );
                                    }}
                                  />
                                  <span className="truncate">{doc.title}</span>
                                </label>
                              ))}
                          </div>
                          {allDocuments.length === 0 && (
                            <div className="px-4 py-3 text-[11px] text-surface-400">
                              {t("agent.noDocuments")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Journal Picker */}
                    <div className={cn(
                      "rounded-xl border transition-all duration-200 overflow-hidden",
                      includeJournal
                        ? "border-brand-200 dark:border-brand-500/25 shadow-sm"
                        : "border-surface-200 dark:border-surface-800 hover:border-brand-200/50 hover:shadow-sm"
                    )}>
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => { setIncludeJournal(!includeJournal); if (includeJournal) { setSelectedJournalIds([]); setJournalFilter(""); } }}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-3 text-xs font-medium transition-all duration-200 cursor-pointer",
                          includeJournal
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            : "text-surface-500 hover:bg-surface-50 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-900 dark:hover:text-surface-200"
                        )}
                      >
                        <NotebookTabs className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{t("agent.includeJournal")}</span>
                        <span className="text-[10px] text-surface-400">{selectedJournalIds.length > 0 ? selectedJournalIds.length : includeJournal ? t("agent.autoSelect") : t("agent.off")}</span>
                      </button>
                      {includeJournal && (
                        <div className="border-t border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-950/30">
                          {journalRecords.length > 0 && (
                            <div className="px-3 pt-2">
                              <Input
                                className="h-8 text-[11px] dark:bg-surface-900"
                                placeholder={t("agent.filterJournal")}
                                value={journalFilter}
                                onChange={(e) => setJournalFilter(e.target.value)}
                              />
                            </div>
                          )}
                          <div className="max-h-[140px] overflow-y-auto">
                            {journalRecords
                              .filter((r) => !journalFilter || r.title.includes(journalFilter))
                              .map((item) => (
                                <label
                                  key={item.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 px-4 py-2 text-xs transition-colors hover:bg-surface-100 dark:hover:bg-surface-800",
                                    selectedJournalIds.includes(item.id) && "bg-brand-50/50 dark:bg-brand-500/5"
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded accent-brand-500"
                                    checked={selectedJournalIds.includes(item.id)}
                                    onChange={(e) => {
                                      setSelectedJournalIds((prev) =>
                                        e.target.checked ? [...prev, item.id] : prev.filter((id) => id !== item.id)
                                      );
                                    }}
                                  />
                                  <span className="truncate">{item.title}</span>
                                </label>
                              ))}
                          </div>
                          {journalRecords.length === 0 && (
                            <div className="px-4 py-3 text-[11px] text-surface-400">
                              {t("agent.noJournalEntries")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <div className="mt-6 flex items-center justify-end gap-2">
                  {!running && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 gap-1.5 px-4"
                      onClick={resetFlow}
                      disabled={!activeStage && !done && !error}
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>{t("agent.reset")}</span>
                    </Button>
                  )}
                  <Button type="button" className="h-11 gap-1.5 px-5" onClick={startFlow} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span>{t("agent.start")}</span>
                  </Button>
                </div>
              </div>
            </Scrollbar>
          </div>

          <aside className="min-h-0 min-w-0 border-t border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900/70 lg:border-l lg:border-t-0">
            <Scrollbar className="h-full">
              <div className="space-y-5 p-5 lg:pt-16">
                <section className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-surface-950 dark:text-surface-50">
                        {t("agent.taskPanel")}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-surface-500 dark:text-surface-400">
                        {hasStarted ? t("agent.liveStatus") : t("agent.taskPanelIdle")}
                      </p>
                    </div>
                    {running && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-500" />}
                  </div>

                  <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900">
                    <p className={cn("line-clamp-3 break-words text-sm font-semibold", error ? "text-red-600 dark:text-red-300" : "text-surface-800 dark:text-surface-100")}>
                      {statusText}
                    </p>
                    <p className="mt-1 text-xs text-surface-500">
                      {done?.title || t("agent.generatedDoc")}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    {stageOrder.map((stage, index) => {
                      const meta = stageMeta[stage];
                      const Icon = meta.icon;
                      const completed = Boolean(events[stage]) || Boolean(done && index <= stageOrder.indexOf("publish"));
                      const active = running && activeStage === stage;
                      const queued = !completed && !active && (activeStageIndex === -1 || index > activeStageIndex);
                      return (
                        <div
                          key={stage}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                            completed
                              ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-200"
                              : active
                                ? "border-brand-300 bg-white text-brand-700 dark:border-brand-500/50 dark:bg-surface-950 dark:text-brand-200"
                                : "border-surface-200 bg-white text-surface-500 dark:border-surface-800 dark:bg-surface-950 dark:text-surface-400",
                            queued && "opacity-75"
                          )}
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-current/10">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="min-w-0 flex-1 text-xs font-semibold">{t(meta.label)}</span>
                          {active && stage === "draft" && events.draft && (events.draft.totalSections ?? 0) > 0 && (
                            <span className="text-[10px] text-surface-400">
                              {(events.draft.sectionIndex ?? 0) + 1}/{events.draft.totalSections}
                            </span>
                          )}
                          {active ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : completed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Circle className="h-3.5 w-3.5 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    {running ? (
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={stopFlow}>
                        <Square className="h-4 w-4" />
                        <span>{t("agent.stop")}</span>
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetFlow} disabled={!activeStage && !done && !error}>
                        <RotateCcw className="h-4 w-4" />
                        <span>{t("agent.reset")}</span>
                      </Button>
                    )}
                    {done?.docId && (
                      <Button size="sm" className="gap-1.5" onClick={openGeneratedDocument}>
                        <FileText className="h-4 w-4" />
                        <span>{t("agent.openDocument")}</span>
                      </Button>
                    )}
                  </div>
                </section>

                {analysis && (
                  <section className="rounded-2xl border border-brand-200 bg-white p-4 shadow-sm dark:border-brand-500/20 dark:bg-surface-950">
                    <div className="mb-3 flex items-center gap-2">
                      <Search className="h-4 w-4 text-brand-500" />
                      <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.step.analyze")}</h3>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-900">
                          <span className="text-[10px] text-surface-400">{t("agent.analysisGenre")}</span>
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-100">{analysis.genre}</p>
                        </div>
                        <div className="rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-900">
                          <span className="text-[10px] text-surface-400">{t("agent.analysisTone")}</span>
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-100">{analysis.tone}</p>
                        </div>
                      </div>
                      {analysis.themes.length > 0 && (
                        <div className="rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-900">
                          <span className="text-[10px] text-surface-400">{t("agent.analysisThemes")}</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {analysis.themes.map((theme) => (
                              <span key={theme} className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{theme}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="rounded-lg bg-surface-50 px-3 py-2 dark:bg-surface-900">
                        <span className="text-[10px] text-surface-400">{t("agent.analysisWords")}</span>
                        <p className="text-xs font-semibold text-surface-800 dark:text-surface-100">{analysis.estimatedWords} {t("documents.wordsUnit")}</p>
                      </div>
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                  <div className="mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-brand-500" />
                    <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.sources")}</h3>
                  </div>
                  <div className="space-y-2">
                    {sources.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-surface-200 px-3 py-4 text-xs leading-5 text-surface-400 dark:border-surface-800">
                        {t("agent.noSources")}
                      </p>
                    ) : sources.slice(0, 5).map((source) => (
                      <div key={`${source.type}:${source.id}:${source.title}`} className="rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-surface-800 dark:text-surface-100">{source.title}</span>
                          {source.score !== undefined && (
                            <span className="text-[10px] text-surface-400">{Math.round(source.score * 100)}%</span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-surface-500">{source.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-brand-500" />
                    <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.step.plan")}</h3>
                  </div>
                  <div className="space-y-2">
                    {outline.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-surface-200 px-3 py-4 text-xs leading-5 text-surface-400 dark:border-surface-800">
                        {t("agent.noOutline")}
                      </p>
                    ) : (
                      outline.map((item, index) => (
                        <div key={`${item.heading}:${index}`} className="rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900">
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-100">{item.heading}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-surface-500">{item.brief}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {draftContent && (
                  <section className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                    <div className="mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-500" />
                      <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.draftPreview")}</h3>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto rounded-lg border border-surface-200 bg-surface-50 p-3 text-xs leading-relaxed text-surface-600 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-300 prose prose-sm max-w-none dark:prose-invert">
                      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(draftContent)) }} />
                    </div>
                  </section>
                )}

                <section className="rounded-2xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                  <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.reviewSuggestions")}</h3>
                  {review ? (
                    <div className="mt-3">
                      <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-900">
                        <span className="text-xs text-surface-500">{t("agent.reviewScore")}</span>
                        <span className="text-lg font-bold text-brand-600 dark:text-brand-300">{review.score}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {review.suggestions.length === 0 ? (
                          <p className="text-xs leading-relaxed text-surface-400">{t("agent.noReviewSuggestions")}</p>
                        ) : (
                          review.suggestions.map((item, index) => (
                            <p key={`${item.detail}:${index}`} className="rounded-lg bg-surface-50 p-3 text-xs leading-relaxed text-surface-500 dark:bg-surface-900">
                              {item.detail}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-surface-200 px-3 py-4 text-xs leading-5 text-surface-400 dark:border-surface-800">
                      {t("agent.idle")}
                    </p>
                  )}
                </section>
              </div>
            </Scrollbar>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
