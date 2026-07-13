import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderAiChatHtml } from "../src/lib/aiChatHtml.ts";

describe("AI chat rich HTML rendering", () => {
  it("renders markdown replies as structured HTML", () => {
    const html = renderAiChatHtml("## 写作状态\n\n- **今日**：519 字\n- `文档` 1 篇");

    assert.match(html, /<h2>写作状态<\/h2>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<strong>今日<\/strong>/);
    assert.match(html, /<code>文档<\/code>/);
  });

  it("keeps safe direct HTML fragments", () => {
    const html = renderAiChatHtml("<h2>结论</h2><p><strong>今天适合继续写。</strong></p>");

    assert.match(html, /<h2>结论<\/h2>/);
    assert.match(html, /<strong>今天适合继续写。<\/strong>/);
  });

  it("removes unsafe HTML from direct fragments", () => {
    const html = renderAiChatHtml('<h2 class="hidden">标题</h2><script>alert(1)</script><a href="javascript:alert(1)" style="color:red" onclick="alert(1)">链接</a>');

    assert.match(html, /<h2>标题<\/h2>/);
    assert.match(html, /<a>链接<\/a>/);
    assert.doesNotMatch(html, /script|javascript|onclick|style|class/);
  });

  it("does not treat ordinary angle brackets as HTML", () => {
    const html = renderAiChatHtml("判断：1 < 2，而且 <unknown> 应该作为文本。");

    assert.match(html, /1 &lt; 2/);
    assert.match(html, /&lt;unknown&gt;/);
  });
});
