import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_MODEL_CONFIG_HASH, resolveAiReadiness } from "../src/lib/aiReadiness.ts";

describe("AI readiness", () => {
  it("distinguishes ready, missing, and unavailable model configuration", async () => {
    assert.equal(await resolveAiReadiness(async () => ({ hasKey: true })), "ready");
    assert.equal(await resolveAiReadiness(async () => ({ hasKey: false })), "missing");
    assert.equal(await resolveAiReadiness(async () => { throw new Error("offline"); }), "unavailable");
  });

  it("uses the model configuration route", () => {
    assert.equal(AI_MODEL_CONFIG_HASH, "#/model-config");
  });
});
