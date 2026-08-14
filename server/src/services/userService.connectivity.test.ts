import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { testChatModel } from "./userService";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("chat model connectivity test", () => {
  it("reaches an OpenAI-compatible model hosted on the LAN", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({
        model: "google/gemma-4-31B-it",
        choices: [{ message: { role: "assistant", content: "你好！" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const result = await testChatModel({
      baseUrl: "http://172.16.76.112:8000/v1/",
      apiKey: "test-key",
      model: "google/gemma-4-31B-it",
      prompt: "你好！",
    });

    assert.equal(requestedUrl, "http://172.16.76.112:8000/v1/chat/completions");
    assert.equal(new Headers(requestedInit?.headers).get("Authorization"), "Bearer test-key");
    assert.deepEqual(result, { reply: "你好！", model: "google/gemma-4-31B-it" });
  });

  it("does not append the chat path twice when a full endpoint is entered", async () => {
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await testChatModel({
      baseUrl: "https://provider.example/v1/chat/completions",
      apiKey: "test-key",
      model: "test-model",
    });

    assert.equal(requestedUrl, "https://provider.example/v1/chat/completions");
  });
});
