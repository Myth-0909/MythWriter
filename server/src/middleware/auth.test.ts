import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveJwtSecret } from "./auth";

describe("resolveJwtSecret", () => {
  it("allows the development fallback outside production", () => {
    assert.equal(resolveJwtSecret(undefined, "development"), "prowriter-jwt-secret-key-2024");
    assert.equal(resolveJwtSecret("", "test"), "prowriter-jwt-secret-key-2024");
  });

  it("requires JWT_SECRET in production", () => {
    assert.throws(
      () => resolveJwtSecret(undefined, "production"),
      /JWT_SECRET must be configured/
    );
    assert.throws(
      () => resolveJwtSecret("   ", "production"),
      /JWT_SECRET must be configured/
    );
  });

  it("uses the configured secret when present", () => {
    assert.equal(resolveJwtSecret("custom-secret", "production"), "custom-secret");
  });
});
