import type { KnowledgeLike, RagSearchResult } from "./ragService";
import { markdownToBasicHtml } from "./markdownService";

export { markdownToBasicHtml } from "./markdownService";

export type AgentLength = "short" | "medium" | "long";
export type AgentStyle = "default" | "literary" | "academic" | "business" | "technical";
export type AgentStage = "analyze" | "research" | "plan" | "draft" | "review" | "publish";
export type AgentJsonStep = "analyze" | "plan" | "review";
export type AgentTextStep = "draft";

export type AgentWriteInput = {
  userId: string;
  goal: string;
  style?: AgentStyle | string;
  length?: AgentLength | string;
  includeBrain?: boolean;
  includeDocuments?: boolean;
  lang?: "zh" | "en";
};

export type AgentSource = {
  type: "brain" | "document";
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

function normalizeLength(value: AgentWriteInput["length"]): AgentLength {
  return value === "short" || value === "long" || value === "medium" ? value : "medium";
}

function normalizeStyle(value: AgentWriteInput["style"]): AgentStyle {
  return value === "literary" || value === "academic" || value === "business" || value === "technical"
    ? value
    : "default";
}

function cleanText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeAnalysis(raw: any, input: AgentWriteInput): AgentAnalysis {
  const length = normalizeLength(input.length);
  const themes = Array.isArray(raw?.themes)
    ? raw.themes.map((theme: unknown) => String(theme).trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    genre: cleanText(raw?.genre, "写作任务"),
    tone: cleanText(raw?.tone, styleLabels[normalizeStyle(input.style)]),
    themes: themes.length > 0 ? themes : [input.goal.trim().slice(0, 24)],
    estimatedWords: Math.max(300, Math.min(5000, Number(raw?.estimatedWords) || lengthWords[length])),
  };
}

function normalizeOutline(raw: any, input: AgentWriteInput): { title: string; outline: AgentOutlineItem[] } {
  const length = normalizeLength(input.length);
  const fallbackCount = length === "short" ? 2 : length === "long" ? 5 : 3;
  const rawItems = Array.isArray(raw?.outline) ? raw.outline : Array.isArray(raw?.sections) ? raw.sections : [];
  const outline = rawItems
    .map((item: any, index: number) => ({
      heading: cleanText(item?.heading || item?.title, `第 ${index + 1} 部分`),
      brief: cleanText(item?.brief || item?.summary || item?.goal, "围绕写作目标展开。"),
    }))
    .filter((item: AgentOutlineItem) => item.heading)
    .slice(0, 6);

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
  const length = normalizeLength(input.length);
  const style = normalizeStyle(input.style);
  return [
    "请分析写作目标，只返回 JSON。",
    `写作目标：${input.goal.trim()}`,
    `风格：${styleLabels[style]}`,
    `篇幅：约 ${lengthWords[length]} 字`,
    "JSON 字段：genre, tone, themes, estimatedWords。",
  ].join("\n");
}

function buildPlanPrompt(input: AgentWriteInput, analysis: AgentAnalysis, sourceContext: string): string {
  return [
    "请为写作任务生成标题和大纲，只返回 JSON。",
    `写作目标：${input.goal.trim()}`,
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
  const style = normalizeStyle(input.style);
  return [
    "你是小安，请根据当前章节要求输出正文片段，不要输出 JSON。",
    `总标题：${title}`,
    `写作目标：${input.goal.trim()}`,
    `风格：${styleLabels[style]}`,
    `当前章节：${section.heading}`,
    `章节要求：${section.brief}`,
    `章节进度：${index + 1}/${total}`,
    "可参考资料：",
    sourceContext,
    "要求：内容完整、可直接拼入文档，不要解释你的过程。",
    "格式：使用标准 Markdown 标题、列表、加粗和引用；避免 LaTeX 控制符，箭头请直接使用 →。",
  ].join("\n");
}

function buildReviewPrompt(input: AgentWriteInput, markdown: string): string {
  return [
    "请审阅以下 AI 生成草稿，只返回 JSON。",
    `原始目标：${input.goal.trim()}`,
    "草稿：",
    markdown.slice(0, 12000),
    "JSON 字段：score, suggestions。suggestions 每项包含 detail 和 severity(high/medium/low)。",
  ].join("\n");
}

function agentMessage(input: AgentWriteInput, zh: string, en: string): string {
  return input.lang === "en" ? en : zh;
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
        includeBrain: input.includeBrain !== false,
        includeDocuments: input.includeDocuments !== false,
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

      const [knowledgeResult, documentResult] = await Promise.all([
        normalizedInput.includeBrain
          ? deps.searchKnowledge(normalizedInput.userId, goal, 5)
          : Promise.resolve({ degraded: false, results: [] }),
        normalizedInput.includeDocuments
          ? deps.searchDocuments(normalizedInput.userId, goal, 4)
          : Promise.resolve({ degraded: false, results: [] }),
      ]);
      const sources = [
        ...knowledgeResult.results.map((result) => sourceFromKnowledge(result, knowledgeResult.degraded)),
        ...documentResult.results.map((result) => sourceFromDocument(result, documentResult.degraded)),
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
        const draft = await deps.completeText(
          "draft",
          buildDraftPrompt(normalizedInput, plan.title, section, sourceContext, index, plan.outline.length),
          normalizedInput
        );
        sections.push(`## ${section.heading}\n\n${draft.trim()}`);
      }

      const markdown = `# ${plan.title}\n\n${sections.join("\n\n")}`;
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
