import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentWriteService, markdownToBasicHtml } from "./agentService";

describe("agent write service", () => {
  it("runs the six-step writing flow and publishes a generated document", async () => {
    const emitted: any[] = [];
    const calls: string[] = [];
    const service = createAgentWriteService({
      async completeJson(step) {
        calls.push(`json:${step}`);
        if (step === "analyze") {
          return {
            genre: "设定说明",
            tone: "清晰",
            themes: ["大炎王朝", "修炼体系"],
            estimatedWords: 800,
          };
        }
        if (step === "plan") {
          return {
            title: "大炎王朝修炼入门",
            outline: [
              { heading: "修炼体系总览", brief: "说明境界顺序" },
              { heading: "入门建议", brief: "给初学者行动建议" },
            ],
          };
        }
        return {
          score: 88,
          suggestions: [
            { detail: "结构清晰，可补充例子", severity: "low" },
          ],
        };
      },
      async completeText(step, prompt) {
        calls.push(`text:${step}:${prompt.includes("修炼体系总览") ? "overview" : "advice"}`);
        return prompt.includes("修炼体系总览")
          ? "炼气、筑基、金丹构成入门主线。"
          : "初学者应先稳固根基，再寻找合适功法。";
      },
      async searchKnowledge() {
        calls.push("search:knowledge");
        return {
          degraded: false,
          results: [
            { id: "k1", title: "大炎王朝", description: "修炼体系分为炼气、筑基、金丹。", score: 0.82 },
          ],
        };
      },
      async searchDocuments() {
        calls.push("search:documents");
        return {
          degraded: false,
          results: [
            { id: "d1:0", documentId: "d1", chunkIndex: 0, content: "旧文档提到入门修炼。", score: 0.71 },
          ],
        };
      },
      async createDocument(data) {
        calls.push(`create:${data.title}`);
        assert.match(data.content, /<h1>大炎王朝修炼入门<\/h1>/);
        assert.match(data.content, /炼气、筑基、金丹/);
        return { id: "doc-1", title: data.title };
      },
    });

    const result = await service.write(
      {
        userId: "user-1",
        goal: "写一篇大炎王朝修炼体系的入门文章",
        style: "literary",
        length: "medium",
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
      "review",
      "publish",
    ]);
    assert.equal(result.docId, "doc-1");
    assert.equal(result.title, "大炎王朝修炼入门");
    assert.equal(result.review.score, 88);
    assert.deepEqual(calls, [
      "json:analyze",
      "search:knowledge",
      "search:documents",
      "json:plan",
      "text:draft:overview",
      "text:draft:advice",
      "json:review",
      "create:大炎王朝修炼入门",
    ]);
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
