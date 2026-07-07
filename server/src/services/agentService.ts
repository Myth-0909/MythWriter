import type { KnowledgeLike, RagSearchResult } from "./ragService";
import { markdownToBasicHtml } from "./markdownService";

export { markdownToBasicHtml } from "./markdownService";

export type AgentLength = "short" | "medium" | "long";
export type AgentStyle = "default" | "literary" | "academic" | "business" | "technical";
export type AgentStage = "analyze" | "research" | "plan" | "draft" | "review" | "publish";
export type AgentJsonStep = "analyze" | "plan" | "review";
export type AgentTextStep = "draft" | "adjust";

export type AgentWriteInput = {
  userId: string;
  goal: string;
  style?: AgentStyle | string;
  length?: AgentLength | string;
  stylePrompt?: string;
  targetWords?: number;
  includeBrain?: boolean;
  includeDocuments?: boolean;
  includeJournal?: boolean;
  referenceDocIds?: string[];
  referenceBrainIds?: string[];
  referenceJournalIds?: string[];
  lang?: "zh" | "en";
};

export type AgentSource = {
  type: "brain" | "document" | "web";
  id: string;
  title: string;
  excerpt: string;
  score?: number;
  degraded?: boolean;
};

export type AgentOutlineItem = {
  heading: string;
  brief: string;
};

export type AgentAnalysis = {
  genre: string;
  tone: string;
  themes: string[];
  estimatedWords: number;
};

export type AgentReview = {
  score: number;
  suggestions: { detail: string; severity: "high" | "medium" | "low" }[];
};

export type AgentProgressEvent = {
  stage: AgentStage;
  message: string;
  analysis?: AgentAnalysis;
  sources?: AgentSource[];
  outline?: AgentOutlineItem[];
  sectionIndex?: number;
  totalSections?: number;
  content?: string;
  review?: AgentReview;
  docId?: string;
  title?: string;
};

export type AgentWriteResult = {
  docId: string;
  title: string;
  content: string;
  outline: AgentOutlineItem[];
  analysis: AgentAnalysis;
  sources: AgentSource[];
  review: AgentReview;
};

export type AgentWriteDependencies = {
  completeJson: (step: AgentJsonStep, prompt: string, input: AgentWriteInput) => Promise<unknown>;
  completeText: (step: AgentTextStep, prompt: string, input: AgentWriteInput) => Promise<string>;
  searchKnowledge: (
    userId: string,
    query: string,
    topK?: number
  ) => Promise<RagSearchResult<KnowledgeLike>>;
  searchDocuments: (
    userId: string,
    query: string,
    topK?: number
  ) => Promise<RagSearchResult<{ id: string; documentId: string; chunkIndex: number; content: string; score?: number }>>;
  getKnowledgeByIds?: (ids: string[]) => Promise<KnowledgeLike[]>;
  getDocumentsByIds?: (ids: string[]) => Promise<{ id: string; title: string; content: string }[]>;
  getJournalRecordsByIds?: (ids: string[]) => Promise<{ id: string; title: string; content: string }[]>;
  searchWeb?: (query: string) => Promise<string>;
  createDocument: (data: { title: string; content: string; category: string }) => Promise<{ id: string; title: string }>;
};

const lengthWords: Record<AgentLength, number> = {
  short: 600,
  medium: 1200,
  long: 2200,
};

const styleLabels: Record<AgentStyle, string> = {
  default: "自然清晰",
  literary: "文学叙事",
  academic: "学术严谨",
  business: "商务专业",
  technical: "技术说明",
};

const WORD_TOLERANCE = 50;

type WordBudget = {
  target: number;
  min: number;
  max: number;
};

function countReadableUnits(value: string): number {
  const plain = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~|\[\](){}:：,，.。!！?？;；"“”'‘’-]/g, " ");
  const cjkCount = plain.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = plain
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjkCount + latinCount;
}

function isCjkChar(char: string): boolean {
  return /[\u3400-\u9fff]/.test(char);
}

function isLatinWordChar(char: string): boolean {
  return /[A-Za-z0-9]/.test(char);
}

function trimTextToUnitLimit(value: string, maxUnits: number): string {
  if (maxUnits <= 0) return "";

  let used = 0;
  let index = 0;
  let output = "";

  while (index < value.length) {
    const char = value[index];
    if (isCjkChar(char)) {
      if (used + 1 > maxUnits) break;
      output += char;
      used += 1;
      index += 1;
      continue;
    }

    if (isLatinWordChar(char)) {
      let end = index + 1;
      while (end < value.length && isLatinWordChar(value[end])) end += 1;
      if (used + 1 > maxUnits) break;
      output += value.slice(index, end);
      used += 1;
      index = end;
      continue;
    }

    output += char;
    index += 1;
  }

  return output.replace(/[，,。.!！?？;；:：、\s]+$/, "").trimEnd();
}

function trimMarkdownToUnitLimit(markdown: string, maxUnits: number): string {
  if (countReadableUnits(markdown) <= maxUnits) return markdown.trim();

  const output: string[] = [];
  let used = 0;

  for (const line of markdown.split("\n")) {
    const lineUnits = countReadableUnits(line);
    if (used + lineUnits <= maxUnits) {
      output.push(line);
      used += lineUnits;
      continue;
    }

    const remaining = maxUnits - used;
    if (remaining <= 0) break;

    const headingMatch = line.match(/^(\s{0,3}#{1,6}\s+)(.*)$/);
    const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/);
    if (headingMatch) {
      const trimmed = trimTextToUnitLimit(headingMatch[2], remaining);
      if (trimmed) output.push(`${headingMatch[1]}${trimmed}`);
    } else if (listMatch) {
      const trimmed = trimTextToUnitLimit(listMatch[2], remaining);
      if (trimmed) output.push(`${listMatch[1]}${trimmed}`);
    } else {
      const trimmed = trimTextToUnitLimit(line, remaining);
      if (trimmed) output.push(trimmed);
    }
    break;
  }

  return output.join("\n").replace(/\n{3,}$/g, "\n\n").trim();
}

function sanitizeDraftMarkdown(value: string): string {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getSectionWordBudget(targetWords: number, index: number, total: number): WordBudget {
  const safeTotal = Math.max(1, total);
  const base = Math.floor(targetWords / safeTotal);
  const remainder = targetWords % safeTotal;
  const target = Math.max(1, base + (index < remainder ? 1 : 0));
  const tolerance = Math.max(8, Math.min(30, Math.round(target * 0.08)));
  return {
    target,
    min: Math.max(1, target - tolerance),
    max: target + tolerance,
  };
}

function getTargetWordRange(targetWords: number): { min: number; max: number } {
  return {
    min: Math.max(1, targetWords - WORD_TOLERANCE),
    max: targetWords + WORD_TOLERANCE,
  };
}

function getPreferredOutlineCount(targetWords: number): number {
  if (targetWords <= 800) return 2;
  if (targetWords <= 1600) return 3;
  if (targetWords <= 3000) return 4;
  return 5;
}

function getMaxOutlineCount(targetWords: number): number {
  if (targetWords <= 800) return 3;
  if (targetWords <= 1600) return 4;
  return 6;
}

function enforceMarkdownTarget(markdown: string, targetWords: number): string {
  const maxUnits = getTargetWordRange(targetWords).max;
  return trimMarkdownToUnitLimit(markdown, maxUnits);
}

function ensureMarkdownTitle(markdown: string, title: string): string {
  const cleaned = sanitizeDraftMarkdown(markdown);
  if (!cleaned) return "";
  return cleaned.startsWith("# ") ? cleaned : `# ${title}\n\n${cleaned}`;
}

function normalizeLength(value: AgentWriteInput["length"]): AgentLength {
  return value === "short" || value === "long" || value === "medium" ? value : "medium";
}

function normalizeStyle(value: AgentWriteInput["style"]): AgentStyle {
  return value === "literary" || value === "academic" || value === "business" || value === "technical"
    ? value
    : "default";
}

function normalizeTargetWords(input: AgentWriteInput): number {
  const explicit = Number(input.targetWords);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(300, Math.min(8000, Math.round(explicit)));
  }
  return lengthWords[normalizeLength(input.length)];
}

function getStylePrompt(input: AgentWriteInput): string {
  const customStyle = typeof input.stylePrompt === "string" ? input.stylePrompt.trim() : "";
  return customStyle || styleLabels[normalizeStyle(input.style)];
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeAnalysis(raw: any, input: AgentWriteInput): AgentAnalysis {
  const themes = Array.isArray(raw?.themes)
    ? raw.themes.map((theme: unknown) => String(theme).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    genre: cleanText(raw?.genre, "写作任务"),
    tone: cleanText(raw?.tone, getStylePrompt(input)),
    themes: themes.length > 0 ? themes : [input.goal.trim().slice(0, 24)],
    estimatedWords: Math.max(300, Math.min(8000, Number(raw?.estimatedWords) || normalizeTargetWords(input))),
  };
}

function normalizeOutline(raw: any, input: AgentWriteInput): { title: string; outline: AgentOutlineItem[] } {
  const targetWords = normalizeTargetWords(input);
  const fallbackCount = targetWords <= 800 ? 2 : targetWords >= 2000 ? 5 : 3;
  const maxCount = getMaxOutlineCount(targetWords);
  const rawItems = Array.isArray(raw?.outline) ? raw.outline : Array.isArray(raw?.sections) ? raw.sections : [];
  const outline = rawItems
    .map((item: any, index: number) => ({
      heading: cleanText(item?.heading || item?.title, `第 ${index + 1} 部分`),
      brief: cleanText(item?.brief || item?.summary || item?.goal, "围绕写作目标展开。"),
    }))
    .filter((item: AgentOutlineItem) => item.heading)
    .slice(0, maxCount);

  while (outline.length === 0 || (rawItems.length === 0 && outline.length < fallbackCount)) {
    outline.push({
      heading: outline.length === 0 ? "核心背景" : outline.length === 1 ? "主要内容" : "总结与延展",
      brief: "围绕写作目标补全必要信息。",
    });
  }

  return {
    title: cleanText(raw?.title, input.goal.trim().slice(0, 30) || "AI 写作草稿"),
    outline,
  };
}

function normalizeReview(raw: any): AgentReview {
  const rawSuggestions = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  return {
    score: Math.max(0, Math.min(100, Number(raw?.score) || 78)),
    suggestions: rawSuggestions
      .map((item: any) => ({
        detail: cleanText(item?.detail || item?.title, ""),
        severity: item?.severity === "high" || item?.severity === "low" ? item.severity : "medium",
      }))
      .filter((item: { detail: string }) => item.detail)
      .slice(0, 5),
  };
}

function sourceFromKnowledge(result: KnowledgeLike, degraded: boolean): AgentSource {
  return {
    type: "brain",
    id: String(result.knowledgeId || result.id || result.title),
    title: result.title,
    excerpt: result.description,
    score: result.score,
    degraded,
  };
}

function sourceFromDocument(
  result: { id: string; documentId: string; chunkIndex: number; content: string; score?: number },
  degraded: boolean
): AgentSource {
  return {
    type: "document",
    id: result.documentId,
    title: `文档片段 ${result.chunkIndex + 1}`,
    excerpt: result.content,
    score: result.score,
    degraded,
  };
}

function sourceFromWeb(result: string, query: string): AgentSource {
  return {
    type: "web",
    id: `web-${query.slice(0, 30)}`,
    title: `网络搜索: ${query}`,
    excerpt: result.slice(0, 500),
    score: 0.7,
    degraded: false,
  };
}

function buildSourceContext(sources: AgentSource[]): string {
  if (sources.length === 0) return "无外部资料，请基于用户目标直接写作。";
  return sources
    .map((source) => {
      const prefix = source.type === "brain" ? "设定" : "文档";
      return `- [${prefix}] ${source.title}: ${source.excerpt}`;
    })
    .join("\n");
}

function buildAnalyzePrompt(input: AgentWriteInput): string {
  const stylePrompt = getStylePrompt(input);
  const targetWords = normalizeTargetWords(input);
  return [
    "请分析写作目标，只返回 JSON。",
    `写作目标：${input.goal.trim()}`,
    `风格要求：${stylePrompt}`,
    `目标字数：约 ${targetWords} 字`,
    "JSON 字段：genre, tone, themes, estimatedWords。",
  ].join("\n");
}

function buildPlanPrompt(input: AgentWriteInput, analysis: AgentAnalysis, sourceContext: string): string {
  const targetWords = normalizeTargetWords(input);
  const preferredCount = getPreferredOutlineCount(targetWords);
  return [
    "请为写作任务生成标题和大纲，只返回 JSON。",
    `写作目标：${input.goal.trim()}`,
    `目标总字数：${targetWords} 字，全文必须控制在 ${targetWords - WORD_TOLERANCE}-${targetWords + WORD_TOLERANCE} 字之间。`,
    `建议大纲数量：${preferredCount} 个章节左右，短文不要拆得过碎。`,
    `任务分析：${JSON.stringify(analysis)}`,
    "可参考资料：",
    sourceContext,
    "JSON 字段：title, outline。outline 每项包含 heading 和 brief。",
  ].join("\n");
}

function buildDraftPrompt(
  input: AgentWriteInput,
  title: string,
  section: AgentOutlineItem,
  sourceContext: string,
  index: number,
  total: number
): string {
  const stylePrompt = getStylePrompt(input);
  const targetWords = normalizeTargetWords(input);
  const sectionBudget = getSectionWordBudget(targetWords, index, total);
  return [
    "你是小安，请根据当前章节要求输出正文片段，不要输出 JSON。",
    `总标题：${title}`,
    `写作目标：${input.goal.trim()}`,
    `风格要求：${stylePrompt}`,
    `全文目标字数：${targetWords} 字，最终全文必须控制在 ${targetWords - WORD_TOLERANCE}-${targetWords + WORD_TOLERANCE} 字之间。`,
    `当前章节目标字数：约 ${sectionBudget.target} 字，请控制在 ${sectionBudget.min}-${sectionBudget.max} 字。`,
    `当前章节：${section.heading}`,
    `章节要求：${section.brief}`,
    `章节进度：${index + 1}/${total}`,
    "可参考资料：",
    sourceContext,
    "要求：只写当前章节正文，不要输出总标题、章节标题、解释过程或额外章节。",
    "格式：使用标准 Markdown 标题、列表、加粗和引用；避免 LaTeX 控制符，箭头请直接使用 →。",
  ].join("\n");
}

function buildLengthAdjustPrompt(input: AgentWriteInput, title: string, markdown: string, currentUnits: number): string {
  const targetWords = normalizeTargetWords(input);
  const range = getTargetWordRange(targetWords);
  return [
    "请把以下 Markdown 草稿补写为完整成稿，只返回 Markdown，不要解释。",
    `原始写作目标：${input.goal.trim()}`,
    `当前全文字数：${currentUnits} 字`,
    `目标全文字数：${targetWords} 字，必须控制在 ${range.min}-${range.max} 字之间。`,
    `标题：${title}`,
    "要求：保留原文标题、章节顺序和主要信息；只补充必要的场景、论述或细节，不要新增无关章节。",
    "草稿：",
    markdown.slice(0, 12000),
  ].join("\n");
}

function buildReviewPrompt(input: AgentWriteInput, markdown: string): string {
  const MAX_LENGTH = 12000;
  let sample = markdown;
  if (markdown.length > MAX_LENGTH) {
    const headLen = Math.floor(MAX_LENGTH * 0.65);  // ~7800 for intro+body
    const tailLen = MAX_LENGTH - headLen;             // ~4200 for conclusion
    sample = markdown.slice(0, headLen) + `\n\n...（中段省略 ${markdown.length - MAX_LENGTH} 字符）...\n\n` + markdown.slice(-tailLen);
  }
  return [
    "请审阅以下 AI 生成草稿，只返回 JSON。",
    `原始目标：${input.goal.trim()}`,
    "草稿：",
    sample,
    "JSON 字段：score, suggestions。suggestions 每项包含 detail 和 severity(high/medium/low)。",
  ].join("\n");
}

function agentMessage(input: AgentWriteInput, zh: string, en: string): string {
  return input.lang === "en" ? en : zh;
}

// Extract concise keywords from a verbose writing goal for better web search results
function extractSearchQuery(goal: string): string {
  // Remove common writing request prefixes/suffixes
  let query = goal
    .replace(/^(请|帮我|帮我写|写|撰写|写一篇|写一份|写一个|帮我写一篇|帮我写一份|帮我写一个)\s*/g, "")
    .replace(/(的|这篇文章|的报告|文章|文档)$/g, "")
    .trim();
  // Keep only the most meaningful part (first ~50 chars)
  if (query.length > 50) {
    // Try to split on sentence boundaries
    const firstPart = query.split(/[，,。.!！?？;；\n]/)[0].trim();
    if (firstPart.length > 10) query = firstPart;
    else query = query.slice(0, 50);
  }
  return query || goal.trim().slice(0, 50);
}

export function createAgentWriteService(deps: AgentWriteDependencies) {
  return {
    async write(
      input: AgentWriteInput,
      emit: (event: AgentProgressEvent) => void | Promise<void>
    ): Promise<AgentWriteResult> {
      const goal = input.goal.trim();
      if (!goal) throw new Error("写作目标不能为空");

      const normalizedInput: AgentWriteInput = {
        ...input,
        goal,
        length: normalizeLength(input.length),
        style: normalizeStyle(input.style),
        stylePrompt: getStylePrompt(input),
        targetWords: normalizeTargetWords(input),
        includeBrain: input.includeBrain !== false,
        includeDocuments: input.includeDocuments !== false,
        includeJournal: input.includeJournal === true,
      };

      const analysis = normalizeAnalysis(
        await deps.completeJson("analyze", buildAnalyzePrompt(normalizedInput), normalizedInput),
        normalizedInput
      );
      await emit({
        stage: "analyze",
        message: agentMessage(normalizedInput, "已完成目标分析", "Goal analysis complete"),
        analysis,
      });

      const referenceBrainIds = normalizedInput.referenceBrainIds?.length
        ? normalizedInput.referenceBrainIds
        : undefined;
      const referenceDocIds = normalizedInput.referenceDocIds?.length
        ? normalizedInput.referenceDocIds
        : undefined;
      const referenceJournalIds = normalizedInput.referenceJournalIds?.length
        ? normalizedInput.referenceJournalIds
        : undefined;

      const [knowledgeResult, documentResult, journalResult, webResult] = await Promise.all([
        normalizedInput.includeBrain
          ? referenceBrainIds && deps.getKnowledgeByIds
            ? deps.getKnowledgeByIds(referenceBrainIds).then((items) => ({
                degraded: false,
                results: items.map((item) => ({
                  id: item.id,
                  title: item.title,
                  description: 'description' in item ? (item as any).description || '' : '',
                  category: 'category' in item ? (item as any).category || '' : '',
                  score: 1,
                })),
              }))
            : deps.searchKnowledge(normalizedInput.userId, goal, 5)
          : Promise.resolve({ degraded: false, results: [] as KnowledgeLike[] }),
        normalizedInput.includeDocuments
          ? referenceDocIds && deps.getDocumentsByIds
            ? deps.getDocumentsByIds(referenceDocIds).then((items) => ({
                degraded: false,
                results: items.map((item) => ({
                  id: item.id,
                  documentId: item.id,
                  chunkIndex: 0,
                  content: item.content || '',
                  score: 1,
                })),
              }))
            : deps.searchDocuments(normalizedInput.userId, goal, 4)
          : Promise.resolve({ degraded: false, results: [] as any[] }),
        normalizedInput.includeJournal
          ? referenceJournalIds && deps.getJournalRecordsByIds
            ? deps.getJournalRecordsByIds(referenceJournalIds).then((items) => ({
                degraded: false,
                results: items.map((item) => ({
                  id: item.id,
                  documentId: item.id,
                  chunkIndex: 0,
                  content: item.content || '',
                  score: 1,
                })),
              }))
            : Promise.resolve({ degraded: false, results: [] as any[] })
          : Promise.resolve({ degraded: false, results: [] as any[] }),
        deps.searchWeb
          ? deps.searchWeb(extractSearchQuery(goal)).then((text) => text).catch(() => "")
          : Promise.resolve(""),
      ]);
      const sources = [
        ...knowledgeResult.results.map((result) => sourceFromKnowledge(result, knowledgeResult.degraded)),
        ...documentResult.results.map((result) => sourceFromDocument(result, documentResult.degraded)),
        ...journalResult.results.map((result) => sourceFromDocument(result, journalResult.degraded)),
        ...(webResult ? [sourceFromWeb(webResult, goal)] : []),
      ];
      const sourceContext = buildSourceContext(sources);
      await emit({
        stage: "research",
        message: sources.length > 0
          ? agentMessage(normalizedInput, `已检索到 ${sources.length} 条参考资料`, `${sources.length} reference(s) found`)
          : agentMessage(normalizedInput, "未检索到参考资料，继续直接写作", "No references found; continuing with the goal"),
        sources,
      });

      const plan = normalizeOutline(
        await deps.completeJson("plan", buildPlanPrompt(normalizedInput, analysis, sourceContext), normalizedInput),
        normalizedInput
      );
      await emit({
        stage: "plan",
        message: agentMessage(normalizedInput, "已生成写作大纲", "Outline generated"),
        title: plan.title,
        outline: plan.outline,
      });

      const sections: string[] = [];
      for (let index = 0; index < plan.outline.length; index += 1) {
        const section = plan.outline[index];
        const sectionBudget = getSectionWordBudget(normalizedInput.targetWords!, index, plan.outline.length);
        const draft = await deps.completeText(
          "draft",
          buildDraftPrompt(normalizedInput, plan.title, section, sourceContext, index, plan.outline.length),
          {
            ...normalizedInput,
            targetWords: sectionBudget.target,
          }
        );
        const cleanedDraft = sanitizeDraftMarkdown(draft);
        const boundedDraft = trimMarkdownToUnitLimit(cleanedDraft, sectionBudget.max);
        sections.push(`## ${section.heading}\n\n${boundedDraft}`);
        // Emit per-section progress with accumulated content for live preview
        const runningMarkdown = `# ${plan.title}\n\n${sections.join("\n\n")}`;
        await emit({
          stage: "draft",
          message: agentMessage(normalizedInput,
            `正在撰写第 ${index + 1}/${plan.outline.length} 部分：${section.heading}`,
            `Writing section ${index + 1}/${plan.outline.length}: ${section.heading}`
          ),
          sectionIndex: index,
          totalSections: plan.outline.length,
          content: runningMarkdown,
        });
      }

      let markdown = enforceMarkdownTarget(`# ${plan.title}\n\n${sections.join("\n\n")}`, normalizedInput.targetWords!);
      const targetRange = getTargetWordRange(normalizedInput.targetWords!);
      const draftUnits = countReadableUnits(markdown);
      if (draftUnits < targetRange.min) {
        const adjustedDraft = await deps.completeText(
          "adjust",
          buildLengthAdjustPrompt(normalizedInput, plan.title, markdown, draftUnits),
          normalizedInput
        );
        const adjustedMarkdown = ensureMarkdownTitle(adjustedDraft, plan.title);
        if (adjustedMarkdown) {
          markdown = enforceMarkdownTarget(adjustedMarkdown, normalizedInput.targetWords!);
        }
      }
      await emit({
        stage: "draft",
        message: agentMessage(normalizedInput, "已完成草稿生成", "Draft generated"),
        sectionIndex: plan.outline.length,
        totalSections: plan.outline.length,
        content: markdown,
      });

      const review = normalizeReview(
        await deps.completeJson("review", buildReviewPrompt(normalizedInput, markdown), normalizedInput)
      );
      await emit({
        stage: "review",
        message: agentMessage(normalizedInput, `自审评分 ${review.score}`, `Review score ${review.score}`),
        review,
      });

      const doc = await deps.createDocument({
        title: plan.title,
        content: markdownToBasicHtml(markdown),
        category: "general",
      });
      await emit({
        stage: "publish",
        message: agentMessage(normalizedInput, "已发布为新文档", "Published as a new document"),
        docId: doc.id,
        title: doc.title,
      });

      return {
        docId: doc.id,
        title: doc.title,
        content: markdown,
        outline: plan.outline,
        analysis,
        sources,
        review,
      };
    },
  };
}
