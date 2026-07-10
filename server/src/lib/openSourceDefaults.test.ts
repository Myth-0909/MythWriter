import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_CHAT_API_BASE_URL,
  DEFAULT_CHAT_API_KEY,
  DEFAULT_CHAT_MODEL,
} from "./aiProviderDefaults";
import { DEFAULT_EMBEDDING_BASE_URL } from "./embedding";
import { DEFAULT_MILVUS_ADDRESS } from "./milvus";

const envExamplePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env.example");

function assertPublicDefault(value: string) {
  assert.equal(/172\.16\.|192\.168\.|10\.\d+\./.test(value), false);
  assert.equal(/sk-[A-Za-z0-9_-]{8,}/.test(value), false);
}

describe("open-source defaults", () => {
  it("does not ship private chat provider credentials or LAN endpoints", () => {
    assert.equal(DEFAULT_CHAT_API_KEY, "");
    assert.equal(DEFAULT_CHAT_API_BASE_URL, "https://api.deepseek.com/v1");
    assert.equal(DEFAULT_CHAT_MODEL, "deepseek-chat");
    assertPublicDefault(DEFAULT_CHAT_API_BASE_URL);
    assertPublicDefault(DEFAULT_CHAT_API_KEY);
  });

  it("keeps optional vector services unconfigured by default", () => {
    assert.equal(DEFAULT_EMBEDDING_BASE_URL, "");
    assert.equal(DEFAULT_MILVUS_ADDRESS, "");
  });

  it("keeps optional local services commented in the env example", () => {
    const envExample = readFileSync(envExamplePath, "utf8");
    assert.equal(/^DATABASE_URL=/m.test(envExample), false);
    assert.equal(/^REDIS_URL=/m.test(envExample), false);
    assert.match(envExample, /^# DATABASE_URL=/m);
    assert.match(envExample, /^# REDIS_URL=/m);
  });
});
