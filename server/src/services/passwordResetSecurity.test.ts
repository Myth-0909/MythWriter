import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("password reset security wiring", () => {
  it("stores only a password-reset hash and rotates the session version", () => {
    const source = readFileSync(resolve(__dirname, "authService.ts"), "utf8");
    assert.match(source, /hashedCode = await bcrypt\.hash\(code, 10\)/);
    assert.match(source, /resetToken: hashedCode/);
    assert.match(source, /sessionVersion: \{ increment: 1 \}/);
    assert.doesNotMatch(source, /resetToken:\s*code[,\n]/);
  });

  it("returns a developer code only behind explicit local mode", () => {
    const routeSource = readFileSync(resolve(__dirname, "../routes/auth.ts"), "utf8");
    const deliverySource = readFileSync(resolve(__dirname, "passwordResetDeliveryService.ts"), "utf8");
    const forgotRoute = routeSource.slice(
      routeSource.indexOf('router.post("/forgot-password"'),
      routeSource.indexOf('router.post("/reset-password"')
    );
    assert.match(deliverySource, /PASSWORD_RESET_DEV_MODE === "true"/);
    assert.match(deliverySource, /process\.env\.NODE_ENV !== "production"/);
    assert.match(forgotRoute, /devCode = delivery\.code/);
    assert.match(forgotRoute, /\.\.\.\(devCode \? \{ devCode \} : \{\}\)/);
    assert.doesNotMatch(forgotRoute, /\bcode:\s*result\.challenge\.code/);
  });
});
