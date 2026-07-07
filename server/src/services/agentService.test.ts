import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentWriteService, markdownToBasicHtml } from "./agentService";

function countReadableUnits(value: string): number {
  const plain = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_>`~|[\](){}:：,，.。!！?？;；"“”'‘’-]/g, " ");
  const cjkCount = plain.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinCount = plain
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjkCount + latinCount;
}

describe("agent write service", () => {
  it("runs the six-step writing flow and publishes a generated document", async () => {
    const emitted: any[] = [];
    const calls: string[] = [];
    const service = createAgentWriteService({
      async completeJson(step) {
        calls.push(`json:${step}`);
        if (step === "analyze") {
          return {
            genre: "工作周报",
            tone: "简洁专业",
            themes: ["远程办公", "效率提升", "团队协作"],
            estimatedWords: 800,
          };
        }
        if (step === "plan") {
          return {
            title: "远程办公效率提升周报",
            outline: [
              { heading: "本周工作总览", brief: "概述本周主要工作成果" },
              { heading: "下周改进建议", brief: "提出切实可行的优化方案" },
            ],
          };
        }
        return {
          score: 88,
          suggestions: [
            { detail: "结构清晰，可补充具体数据", severity: "low" },
          ],
        };
      },
      async completeText(step, prompt) {
        calls.push(`text:${step}:${prompt.includes("本周工作总览") ? "overview" : "advice"}`);
        return prompt.includes("本周工作总览")
          ? "本周团队远程协作效率提升 15%，主要得益于每日站会和异步沟通工具。".repeat(9)
          : "建议下周引入番茄工作法，并优化任务分配的透明度与跟踪机制。".repeat(9);
      },
      async searchKnowledge() {
        calls.push("search:knowledge");
        return {
          degraded: false,
          results: [
            { id: "k1", title: "远程办公指南", description: "异步沟通和每日站会是提升远程团队效率的关键实践。", score: 0.82 },
          ],
        };
      },
      async searchDocuments() {
        calls.push("search:documents");
        return {
          degraded: false,
          results: [
            { id: "d1:0", documentId: "d1", chunkIndex: 0, content: "上周周报提到团队沟通存在延迟问题。", score: 0.71 },
          ],
        };
      },
      async createDocument(data) {
        calls.push(`create:${data.title}`);
        assert.match(data.content, /<h1>远程办公效率提升周报<\/h1>/);
        assert.match(data.content, /站会|异步/);
        return { id: "doc-1", title: data.title };
      },
    });

    const result = await service.write(
      {
        userId: "user-1",
        goal: "写一篇关于远程办公效率提升的周报",
        style: "business",
        length: "medium",
        targetWords: 300,
        includeBrain: true,
        includeDocuments: true,
      },
      (event) => {
        emitted.push(event);
      }
    );

    assert.deepEqual(emitted.map((event) => event.stage), [
      "analyze",
      "research",
      "plan",
      "draft",
      "draft",
      "draft",
      "review",
      "publish",
    ]);
    // Verify draft progress events carry accumulated content
    const draftEvents = emitted.filter(e => e.stage === "draft");
    assert.equal(draftEvents.length, 3);
    assert.ok(draftEvents.every(e => typeof e.content === "string" && e.content.length > 0));
    assert.ok(draftEvents[0].content!.includes("本周工作总览"));
    assert.ok(draftEvents[1].content!.includes("下周改进建议"));
    assert.equal(result.docId, "doc-1");
    assert.equal(result.title, "远程办公效率提升周报");
    assert.equal(result.review.score, 88);
    assert.deepEqual(calls, [
      "json:analyze",
      "search:knowledge",
      "search:documents",
      "json:plan",
      "text:draft:overview",
      "text:draft:advice",
      "json:review",
      "create:远程办公效率提升周报",
    ]);
  });

  it("keeps generated drafts close to the requested word count across sections", async () => {
    const draftPrompts: string[] = [];
    const service = createAgentWriteService({
      async completeJson(step) {
        if (step === "analyze") {
          return {
            genre: "产品更新日志",
            tone: "清晰",
            themes: ["功能上线", "用户体验"],
            estimatedWords: 600,
          };
        }
        if (step === "plan") {
          return {
            title: "产品功能更新通知",
            outline: [
              { heading: "新增功能", brief: "列出本次上线的功能。" },
              { heading: "优化项", brief: "列出体验改进。" },
              { heading: "后续计划", brief: "预告下个版本。" },
            ],
          };
        }
        return {
          score: 82,
          suggestions: [],
        };
      },
      async completeText(_step, prompt) {
        draftPrompts.push(prompt);
        return "内容段落填充文本。".repeat(70);
      },
      async searchKnowledge() {
        return { degraded: false, results: [] };
      },
      async searchDocuments() {
        return { degraded: false, results: [] };
      },
      async createDocument(data) {
        assert.ok(countReadableUnits(data.content) <= 650);
        return { id: "doc-600", title: data.title };
      },
    });

    const result = await service.write(
      {
        userId: "user-1",
        goal: "写一篇 600 字左右的产品功能更新通知",
        targetWords: 600,
      },
      () => {}
    );

    assert.equal(draftPrompts.length, 3);
    assert.ok(draftPrompts.every((prompt) => prompt.includes("当前章节目标字数")));
    assert.ok(countReadableUnits(result.content) <= 650);
    assert.ok(countReadableUnits(result.content) >= 550);
  });

  it("expands drafts that are too short for the requested word count", async () => {
    let adjustPrompt = "";
    const service = createAgentWriteService({
      async completeJson(step) {
        if (step === "analyze") {
          return {
            genre: "会议纪要",
            tone: "客观",
            themes: ["项目进度", "待办事项"],
            estimatedWords: 600,
          };
        }
        if (step === "plan") {
          return {
            title: "项目周会纪要",
            outline: [
              { heading: "上周回顾", brief: "总结上周工作成果。" },
              { heading: "本周计划", brief: "明确本周重点任务。" },
            ],
          };
        }
        return {
          score: 80,
          suggestions: [],
        };
      },
      async completeText(step, prompt) {
        if (step === "adjust") {
          adjustPrompt = prompt;
          return `# 项目周会纪要\n\n${"会议讨论了本周项目进展与下周计划安排。".repeat(35)}`;
        }
        return "简短草稿。";
      },
      async searchKnowledge() {
        return { degraded: false, results: [] };
      },
      async searchDocuments() {
        return { degraded: false, results: [] };
      },
      async createDocument(data) {
        assert.ok(countReadableUnits(data.content) <= 650);
        assert.ok(countReadableUnits(data.content) >= 550);
        return { id: "doc-short", title: data.title };
      },
    });

    const result = await service.write(
      {
        userId: "user-1",
        goal: "写一篇 600 字左右的星港短篇",
        targetWords: 600,
      },
      () => {}
    );

    assert.match(adjustPrompt, /当前全文字数/);
    assert.ok(countReadableUnits(result.content) <= 650);
    assert.ok(countReadableUnits(result.content) >= 550);
  });

  it("rejects empty writing goals before running model steps", async () => {
    const service = createAgentWriteService({
      async completeJson() {
        throw new Error("should not call model");
      },
      async completeText() {
        throw new Error("should not call model");
      },
      async searchKnowledge() {
        throw new Error("should not search");
      },
      async searchDocuments() {
        throw new Error("should not search");
      },
      async createDocument() {
        throw new Error("should not create document");
      },
    });

    await assert.rejects(
      () => service.write({ userId: "user-1", goal: "   " }, () => {}),
      /写作目标不能为空/
    );
  });

  it("converts common AI markdown into editor-friendly HTML", () => {
    const html = markdownToBasicHtml([
      "# AI Agent 的核心能力架构",
      "",
      "* **传统 Chatbot（对话机器人）：** **核心能力：** 文本生成与信息检索。",
      "* **AI Agent（智能自主体）：** **核心能力：** 推理、规划与工具调用。",
      "",
      "**总结对比表：**",
      "",
      "| 维度 | 传统 Chatbot | AI Agent |",
      "| :--- | :--- | :--- |",
      "| **工作流** | 单次响应 $\\rightarrow$ 等待输入 | 自主循环 $\\rightarrow$ 达成目标 |",
    ].join("\n"));

    assert.match(html, /<h1>AI Agent 的核心能力架构<\/h1>/);
    assert.match(html, /<strong>传统 Chatbot（对话机器人）：<\/strong>/);
    assert.match(html, /<strong>总结对比表：<\/strong>/);
    assert.match(html, /→/);
    assert.match(html, /<h3>总结对比表<\/h3>|<ul>/);
    assert.doesNotMatch(html, /\*\*/);
    assert.doesNotMatch(html, /\$\\rightarrow\$/);
    assert.doesNotMatch(html, /\| :---/);
  });
});
