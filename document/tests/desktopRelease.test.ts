import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("desktop release contract", () => {
  it("requires an explicit production API contract before Tauri packaging", () => {
    const script = readFileSync(new URL("../scripts/build-desktop.mjs", import.meta.url), "utf8");
    const config = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");
    assert.match(script, /VITE_API_BASE_URL is required/);
    assert.match(script, /parsed\.protocol !== "https:"/);
    assert.match(config, /"beforeBuildCommand": "pnpm build:desktop"/);
  });

  it("uses a stable loopback API during local Tauri development", () => {
    const source = readFileSync(new URL("../src/lib/apiBase.ts", import.meta.url), "utf8");
    assert.match(source, /"__TAURI_INTERNALS__" in window/);
    assert.match(source, /http:\/\/127\.0\.0\.1/);
  });

  it("ships Windows launchers without killing arbitrary port owners", () => {
    const powershell = readFileSync(new URL("../../start.ps1", import.meta.url), "utf8");
    const shell = readFileSync(new URL("../../start.sh", import.meta.url), "utf8");
    assert.match(powershell, /Get-NetTCPConnection/);
    assert.match(shell, /assert_port_free/);
    assert.doesNotMatch(shell, /kill -9 \$pid\b/);
  });
});
