import { execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");

console.log("[setup-sqlite] Setting up SQLite database...");

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[setup-sqlite] Created ${DATA_DIR}`);
}

console.log("[setup-sqlite] Generating Prisma client for SQLite...");
execSync("npx prisma generate --schema=prisma/schema-sqlite.prisma", {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("[setup-sqlite] Pushing schema to SQLite...");
execSync("npx prisma db push --schema=prisma/schema-sqlite.prisma", {
  cwd: ROOT,
  stdio: "inherit",
});

console.log("[setup-sqlite] Done! SQLite database is ready at server/data/prowriter.db");
