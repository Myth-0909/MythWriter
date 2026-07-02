import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, BookOpen, CheckCircle2, Circle, ClipboardCheck, FileText, Loader2, RotateCcw, Search, Send, Square } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Scrollbar } from "@/components/ui/scrollbar";
import { useI18n, type TranslationKey } from "@/components/I18nProvider";
import { useToast } from "@/components/Toast";
import { useDocuments } from "@/store";
import { cn } from "@/lib/utils";
import { streamAgentWrite, type AgentDoneEvent, type AgentProgressEvent, type AgentStage, type AgentWriteRequest } from "@/api";

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

const styleOptions: { value: NonNullable<AgentWriteRequest["style"]>; label: TranslationKey }[] = [
  { value: "default", label: "agent.styleDefault" },
  { value: "literary", label: "agent.styleLiterary" },
  { value: "academic", label: "agent.styleAcademic" },
  { value: "business", label: "agent.styleBusiness" },
  { value: "technical", label: "agent.styleTechnical" },
];

const lengthOptions: { value: NonNullable<AgentWriteRequest["length"]>; label: TranslationKey }[] = [
  { value: "short", label: "agent.lengthShort" },
  { value: "medium", label: "agent.lengthMedium" },
  { value: "long", label: "agent.lengthLong" },
];

export function AgentWritePanel({ open, onOpenChange, onOpenDocument }: AgentWritePanelProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { refreshDocuments } = useDocuments();
  const [goal, setGoal] = useState("");
  const [style, setStyle] = useState<NonNullable<AgentWriteRequest["style"]>>("default");
  const [length, setLength] = useState<NonNullable<AgentWriteRequest["length"]>>("medium");
  const [includeBrain, setIncludeBrain] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [events, setEvents] = useState<Partial<Record<AgentStage, AgentProgressEvent>>>({});
  const [activeStage, setActiveStage] = useState<AgentStage | null>(null);
  const [done, setDone] = useState<AgentDoneEvent | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
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

  const sources = events.research?.sources || done?.sources || [];
  const outline = events.plan?.outline || done?.outline || [];
  const review = events.review?.review || done?.review;

  const statusText = useMemo(() => {
    if (error) return error;
    if (done) return t("agent.complete");
    if (activeStage) return events[activeStage]?.message || t(stageMeta[activeStage].label);
    return t("agent.idle");
  }, [activeStage, done, error, events, t]);

  const resetFlow = () => {
    setEvents({});
    setActiveStage(null);
    setDone(null);
    setError("");
  };

  const stopFlow = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
  };

  const startFlow = async () => {
    if (!goal.trim()) {
      setError(t("agent.goalRequired"));
      toast(t("agent.goalRequired"), "error");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    resetFlow();

    try {
      await streamAgentWrite(
        {
          goal: goal.trim(),
          style,
          length,
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
      if (err?.name !== "AbortError") {
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
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="h-[86vh] w-[calc(100vw-1rem)] max-w-[920px] overflow-hidden p-0 sm:w-[calc(100vw-2rem)]" hideCloseButton={running}>
        <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(180px,0.55fr)] bg-white dark:bg-surface-950 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-none">
          <div className="flex min-h-0 min-w-0 flex-col border-b border-surface-200 dark:border-surface-800 lg:border-b-0 lg:border-r">
            <div className="border-b border-surface-200 px-6 py-5 dark:border-surface-800">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-xl">{t("agent.title")}</DialogTitle>
                  <DialogDescription className="mt-2 max-w-[560px] leading-relaxed">
                    {t("agent.subtitle")}
                  </DialogDescription>
                </div>
              </div>
            </div>

            <Scrollbar className="min-h-0 flex-1">
              <div className="space-y-6 px-6 py-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                    {t("agent.goalLabel")}
                  </label>
                  <Textarea
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder={t("agent.goalPlaceholder")}
                    disabled={running}
                    className="min-h-28"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                      {t("agent.style")}
                    </label>
                    <Select value={style} onValueChange={(value) => setStyle(value as typeof style)} disabled={running}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {styleOptions.map((option, index) => (
                          <SelectItem key={option.value} value={option.value} index={index}>
                            {t(option.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-surface-600 dark:text-surface-300">
                      {t("agent.length")}
                    </label>
                    <Select value={length} onValueChange={(value) => setLength(value as typeof length)} disabled={running}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {lengthOptions.map((option, index) => (
                          <SelectItem key={option.value} value={option.value} index={index}>
                            {t(option.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Toggle
                    pressed={includeBrain}
                    onPressedChange={setIncludeBrain}
                    disabled={running}
                    variant="outline"
                    size="lg"
                    className="h-11 w-full justify-start gap-2 px-3 text-xs"
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
                    className="h-11 w-full justify-start gap-2 px-3 text-xs"
                  >
                    <FileText className="h-4 w-4" />
                    <span>{t("agent.includeDocs")}</span>
                  </Toggle>
                </div>

                <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm font-semibold", error ? "text-red-600 dark:text-red-300" : "text-surface-800 dark:text-surface-100")}>
                        {statusText}
                      </p>
                      <p className="mt-1 text-xs text-surface-500">
                        {done?.title || t("agent.generatedDoc")}
                      </p>
                    </div>
                    {done?.docId && (
                      <Button size="sm" className="shrink-0 gap-1.5" onClick={openGeneratedDocument}>
                        <FileText className="h-4 w-4" />
                        <span>{t("agent.openDocument")}</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {stageOrder.map((stage, index) => {
                    const meta = stageMeta[stage];
                    const Icon = meta.icon;
                    const completed = Boolean(events[stage]) || Boolean(done && index <= stageOrder.indexOf("publish"));
                    const active = running && activeStage === stage;
                    return (
                      <div
                        key={stage}
                        className={cn(
                          "flex min-h-20 flex-col justify-between rounded-lg border p-3 transition-colors",
                          completed
                            ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-200"
                            : active
                              ? "border-brand-300 bg-white text-brand-700 dark:border-brand-700 dark:bg-surface-900 dark:text-brand-200"
                              : "border-surface-200 bg-white text-surface-500 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-400"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <Icon className="h-4 w-4" />
                          {active ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : completed ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <Circle className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <span className="mt-3 text-[11px] font-semibold leading-tight">{t(meta.label)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-end gap-2">
                  {running ? (
                    <Button type="button" variant="outline" className="gap-1.5" onClick={stopFlow}>
                      <Square className="h-4 w-4" />
                      <span>{t("agent.stop")}</span>
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" className="gap-1.5" onClick={resetFlow} disabled={!activeStage && !done && !error}>
                      <RotateCcw className="h-4 w-4" />
                      <span>{t("agent.reset")}</span>
                    </Button>
                  )}
                  <Button type="button" className="gap-1.5" onClick={startFlow} disabled={running}>
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span>{t("agent.start")}</span>
                  </Button>
                </div>
              </div>
            </Scrollbar>
          </div>

          <aside className="min-h-0 min-w-0 border-t border-surface-200 bg-surface-50/80 dark:border-surface-800 dark:bg-surface-900/70 lg:border-t-0">
            <Scrollbar className="h-full">
              <div className="space-y-5 p-5">
                <section>
                  <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.sources")}</h3>
                  <div className="mt-3 space-y-2">
                    {sources.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-surface-200 px-3 py-4 text-xs text-surface-400 dark:border-surface-800">
                        {t("agent.noSources")}
                      </p>
                    ) : sources.slice(0, 5).map((source) => (
                      <div key={`${source.type}:${source.id}:${source.title}`} className="rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950">
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

                <section>
                  <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.step.plan")}</h3>
                  <div className="mt-3 space-y-2">
                    {outline.map((item, index) => (
                      <div key={`${item.heading}:${index}`} className="rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950">
                        <p className="text-xs font-semibold text-surface-800 dark:text-surface-100">{item.heading}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-surface-500">{item.brief}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold text-surface-700 dark:text-surface-200">{t("agent.reviewSuggestions")}</h3>
                  {review ? (
                    <div className="mt-3 rounded-lg border border-surface-200 bg-white p-3 dark:border-surface-800 dark:bg-surface-950">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-surface-500">{t("agent.reviewScore")}</span>
                        <span className="text-lg font-bold text-brand-600 dark:text-brand-300">{review.score}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {review.suggestions.map((item, index) => (
                          <p key={`${item.detail}:${index}`} className="text-xs leading-relaxed text-surface-500">
                            {item.detail}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border border-dashed border-surface-200 px-3 py-4 text-xs text-surface-400 dark:border-surface-800">
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
