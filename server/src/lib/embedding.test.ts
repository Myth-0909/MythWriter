import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_EMBEDDING_API_KEY,
  DEFAULT_EMBEDDING_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  generateEmbedding,
  generateEmbeddings,
  getUserEmbeddingConfig,
  resolveEmbeddingConfig,
} from "./embedding";

describe("embedding client", () => {
  it("resolves blank user settings to server defaults", () => {
    assert.deepEqual(
      resolveEmbeddingConfig({
        embeddingApiKey: " ",
        embeddingBaseUrl: "",
        embeddingModel: null,
      }),
      {
        apiKey: DEFAULT_EMBEDDING_API_KEY,
        baseUrl: DEFAULT_EMBEDDING_BASE_URL,
        model: DEFAULT_EMBEDDING_MODEL,
      }
    );
  });

  it("posts batch inputs to the OpenAI-compatible embeddings endpoint", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const fetcher = async (url: string, init: any) => {
      calls.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2] },
            { embedding: [0.3, 0.4] },
          ],
        }),
      };
    };

    const vectors = await generateEmbeddings(
      ["alpha", "beta"],
      {
        apiKey: "test-key",
        baseUrl: "http://embedding.local/v1/",
        model: "embedding-model",
      },
      fetcher
    );

    assert.deepEqual(vectors, [[0.1, 0.2], [0.3, 0.4]]);
    assert.equal(calls[0].url, "http://embedding.local/v1/embeddings");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      model: "embedding-model",
      input: ["alpha", "beta"],
    });
  });

  it("ignores undefined partial config fields when generating embeddings", async () => {
    const calls: Array<{ url: string; init: any }> = [];
    await generateEmbeddings(
      ["alpha"],
      {
        apiKey: "test-key",
        baseUrl: "http://embedding.local/v1",
        model: undefined,
      },
      async (url: string, init: any) => {
        calls.push({ url, init });
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
        };
      }
    );

    assert.deepEqual(JSON.parse(calls[0].init.body), {
      model: DEFAULT_EMBEDDING_MODEL,
      input: ["alpha"],
    });
  });

  it("loads user embedding settings through an injectable loader", async () => {
    const config = await getUserEmbeddingConfig("user-1", async (userId) => {
      assert.equal(userId, "user-1");
      return {
        embeddingApiKey: "user-key",
        embeddingBaseUrl: "http://user-embedding.local/v1",
        embeddingModel: "user-embedding-model",
      };
    });

    assert.deepEqual(config, {
      apiKey: "user-key",
      baseUrl: "http://user-embedding.local/v1",
      model: "user-embedding-model",
    });
  });

  it("unwraps a single embedding vector", async () => {
    const vector = await generateEmbedding("alpha", { apiKey: "test-key" }, async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
    }));

    assert.deepEqual(vector, [1, 2, 3]);
  });

  it("requires an API key before sending embedding requests", async () => {
    let called = false;

    await assert.rejects(
      () => generateEmbeddings(["alpha"], { apiKey: "" }, async () => {
        called = true;
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: [1, 2, 3] }] }),
        };
      }),
      /Embedding API key is not configured/
    );
    assert.equal(called, false);
  });

  it("throws when the embedding service returns malformed data", async () => {
    await assert.rejects(
      () => generateEmbeddings(["alpha"], { apiKey: "test-key" }, async () => ({
        ok: true,
        json: async () => ({ data: [{ embedding: ["bad"] }] }),
      })),
      /Invalid embedding response/
    );
  });
});
