import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_LOCAL_SQLITE_DATABASE_URL,
  applyRuntimeConfigDefaults,
} from "./runtimeConfig";

describe("runtime config defaults", () => {
  it("fills local-only defaults when no environment file is present", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimeConfigDefaults(env, "development");

    assert.equal(env.SQLITE_DATABASE_URL, DEFAULT_LOCAL_SQLITE_DATABASE_URL);
    assert.equal(env.NODE_USE_ENV_PROXY, "1");
    assert.equal(env.JWT_SECRET, "prowriter-jwt-secret-key-2024");
    assert.equal(env.DATABASE_URL, undefined);
  });

  it("does not invent local secrets or database urls in production", () => {
    const env: NodeJS.ProcessEnv = {};

    applyRuntimeConfigDefaults(env, "production");

    assert.equal(env.SQLITE_DATABASE_URL, undefined);
    assert.equal(env.NODE_USE_ENV_PROXY, undefined);
    assert.equal(env.JWT_SECRET, undefined);
    assert.equal(env.DATABASE_URL, undefined);
  });

  it("keeps explicitly configured values", () => {
    const env: NodeJS.ProcessEnv = {
      SQLITE_DATABASE_URL: "file:../data/custom.db",
      NODE_USE_ENV_PROXY: "0",
      JWT_SECRET: "configured-secret",
    };

    applyRuntimeConfigDefaults(env, "development");

    assert.equal(env.SQLITE_DATABASE_URL, "file:../data/custom.db");
    assert.equal(env.NODE_USE_ENV_PROXY, "0");
    assert.equal(env.JWT_SECRET, "configured-secret");
  });
});
