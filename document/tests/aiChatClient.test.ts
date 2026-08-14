import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { streamChat } from "../src/lib/aiChatClient.ts";

const encoder = new TextEncoder();

function installBrowserStubs(frames: string[]) {
  const previousFetch = globalThis.fetch;
  const previousStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = { getItem: () => null };
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } })) as typeof fetch;
  return () => {
    globalThis.fetch = previousFetch;
    (globalThis as any).localStorage = previousStorage;
  };
}

const request = {
  messages: [{ role: "user", content: "你好" }],
  personality: "normal",
  memoryContext: "",
};

describe("AI chat SSE client", () => {
  it("parses CRLF frames and requires a done event", async () => {
    const restore = installBrowserStubs([
      "event: delta\r",
      "\ndata: {\"delta\":\"你好\"}\r\n\r\n",
      "event:done\r\ndata:{\"reply\":\"你好\",\"action\":null}\r\n\r\n",
    ]);
    try {
      let streamed = "";
      const result = await streamChat(request, (delta) => { streamed += delta; }, () => {}, () => {}, new AbortController().signal);
      assert.equal(streamed, "你好");
      assert.equal(result.reply, "你好");
    } finally {
      restore();
    }
  });

  it("marks a stream without a done event as incomplete", async () => {
    const restore = installBrowserStubs(["event: delta\ndata: {\"delta\":\"半段回答\"}\n\n"]);
    try {
      await assert.rejects(
        () => streamChat(request, () => {}, () => {}, () => {}, new AbortController().signal),
        /CHAT_STREAM_INCOMPLETE/
      );
    } finally {
      restore();
    }
  });

  it("surfaces server SSE error events instead of silently ignoring them", async () => {
    const restore = installBrowserStubs(["event:error\ndata:{\"error\":\"服务暂不可用\"}\n\n"]);
    try {
      await assert.rejects(
        () => streamChat(request, () => {}, () => {}, () => {}, new AbortController().signal),
        /服务暂不可用/
      );
    } finally {
      restore();
    }
  });
});
