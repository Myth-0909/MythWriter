import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  PenLine,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Square,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { cn } from "@/lib/utils";
import { streamAgentWrite, type AgentDoneEvent, type AgentProgressEvent, type AgentStage } from "@/api";

interface AgentWritePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenDocument: (docId: string) => void;
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

export function AgentWritePanel({ open, onOpenChange, onOpenDocument }: AgentWritePanelProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refreshDocuments } = useDocuments();
  const [goal, setGoal] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [wordCount, setWordCount] = useState("1200");
  const [includeBrain, setIncludeBrain] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);
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

  const sources = events.research?.sources || done?.sources || [];
  const outline = events.plan?.outline || done?.outline || [];
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
      <DialogContent className="h-[86vh] w-[calc(100vw-1rem)] max-w-[1120px] overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
        <div className="grid h-full min-h-0 grid-cols-1 bg-surface-50 dark:bg-surface-950 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="flex min-h-0 min-w-0 flex-col bg-white dark:bg-surface-950">
            <div className="relative overflow-hidden border-b border-surface-200 px-7 py-6 dark:border-surface-800">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(59,130,246,0.14),transparent_30%),radial-gradient(circle_at_86%_22%,rgba(216,189,115,0.16),transparent_26%)]" />
              <div className="relative flex items-start justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-950 text-brand-200 shadow-sm dark:bg-surface-100 dark:text-surface-950">
                    <Bot className="h-6 w-6" />
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
                        <p className="mt-2 text-[11px] leading-5 text-surface-400">{t("agent.styleHint")}</p>
                      </div>

                      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-800 dark:bg-surface-950">
                        <label className="mb-3 block text-xs font-semibold text-surface-600 dark:text-surface-300">
                          {t("agent.length")}
                        </label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          min={300}
                          max={8000}
                          step={1}
                          value={wordCount}
                          onChange={(event) => setWordCount(sanitizeWordCount(event.target.value))}
                          onKeyDown={(event) => {
                            if (["e", "E", "+", "-", ".", ","].includes(event.key)) event.preventDefault();
                          }}
                          placeholder={t("agent.wordCountPlaceholder")}
                          disabled={running}
                          className="h-11 rounded-xl bg-surface-50/80 shadow-none dark:bg-surface-900"
                        />
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Toggle
                      pressed={includeBrain}
                      onPressedChange={setIncludeBrain}
                      disabled={running}
                      variant="outline"
                      size="lg"
                      className="h-14 w-full justify-start gap-3 rounded-xl px-4 text-xs"
                    >
                      <BookOpen className="h-4 w-4" />
                      <span>{t("agent.includeBrain")}</span>
                    </Toggle>
                    <Toggle
                      pressed={includeDocuments}
                      onPressedChange={setIncludeDocuments}
                      disabled={running}
                      variant="outline"
                      size="lg"
                      className="h-14 w-full justify-start gap-3 rounded-xl px-4 text-xs"
                    >
                      <FileText className="h-4 w-4" />
                      <span>{t("agent.includeDocs")}</span>
                    </Toggle>
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
              <div className="space-y-5 p-5">
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
