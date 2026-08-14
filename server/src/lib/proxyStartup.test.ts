import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("server proxy startup", () => {
  it("does not force Node to use inherited shell proxies", () => {
    const root = resolve(__dirname, "../../..");
    const startScript = readFileSync(resolve(root, "start.sh"), "utf8");
    const productionStart = readFileSync(resolve(root, "server/scripts/start.js"), "utf8");

    assert.doesNotMatch(startScript, /NODE_USE_ENV_PROXY="\$\{NODE_USE_ENV_PROXY:-1\}"/);
    assert.doesNotMatch(productionStart, /NODE_USE_ENV_PROXY\s*\|\|=\s*["']1["']/);
  });
});
