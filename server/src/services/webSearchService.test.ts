import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBingHtml,
  parseBingRss,
  searchWeb,
} from "./webSearchService";

describe("web search service", () => {
  it("parses Bing RSS results with source URLs", () => {
    const entries = parseBingRss(`
      <rss><channel><item>
        <title>DeepSeek &amp; V4 Pro</title>
        <link>https://www.deepseek.com/news</link>
        <description><![CDATA[<b>Official</b> release &amp; details]]></description>
      </item></channel></rss>
    `);

    assert.deepEqual(entries, [{
      title: "DeepSeek & V4 Pro",
      url: "https://www.deepseek.com/news",
      snippet: "Official release & details",
    }]);
  });

  it("parses Bing HTML when RSS is unavailable", () => {
    const entries = parseBingHtml(`
      <ol><li class="b_algo">
        <h2><a href="https://example.com/release">Release notes</a></h2>
        <div class="b_caption"><p>The official model update.</p></div>
      </li></ol>
    `);

    assert.equal(entries[0]?.title, "Release notes");
    assert.equal(entries[0]?.url, "https://example.com/release");
    assert.equal(entries[0]?.snippet, "The official model update.");
  });

  it("uses Bing RSS first and formats evidence for the model", async () => {
    let calls = 0;
    const result = await searchWeb("DeepSeek V4 Pro release unique-1", {
      lang: "zh",
      fetchImpl: async () => {
        calls += 1;
        return new Response(`
          <rss><channel><item>
            <title>DeepSeek official</title>
            <link>https://www.deepseek.com/</link>
            <description>Official V4 Pro release information.</description>
          </item></channel></rss>
        `, { status: 200 });
      },
    });

    assert.equal(calls, 1);
    assert.match(result, /来源：Bing RSS/);
    assert.match(result, /https:\/\/www\.deepseek\.com\//);
    assert.match(result, /Official V4 Pro release information/);
  });

  it("falls back to Bing HTML instead of retrying one failed provider", async () => {
    let calls = 0;
    const result = await searchWeb("fallback provider unique-2", {
      lang: "en",
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("fetch failed");
        return new Response(`
          <li class="b_algo">
            <h2><a href="https://example.com/current">Current report</a></h2>
            <p>Verified current information.</p>
          </li>
        `, { status: 200 });
      },
    });

    assert.equal(calls, 2);
    assert.match(result, /source: Bing HTML/);
    assert.match(result, /Verified current information/);
  });

  it("returns an honest failure only after all providers fail", async () => {
    let calls = 0;
    const result = await searchWeb("all providers fail unique-3", {
      lang: "zh",
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError("fetch failed");
      },
    });

    assert.equal(calls, 3);
    assert.match(result, /可用搜索源均未返回结果/);
  });
});
