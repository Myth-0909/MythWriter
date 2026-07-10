import { spawn } from "node:child_process";
import path from "node:path";
import { applyRuntimeConfigDefaults } from "../src/lib/runtimeConfig";
import { ensureLocalConfig } from "./ensure-local-config";

const ROOT = path.resolve(__dirname, "..");
const TSX = process.platform === "win32" ? "tsx.cmd" : "tsx";

async function main() {
  await ensureLocalConfig();
  applyRuntimeConfigDefaults();

  const child = spawn(TSX, ["watch", "src/index.ts"], {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
