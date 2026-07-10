import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  applyRuntimeConfigDefaults,
  ensureLocalDataDir,
} from "../src/lib/runtimeConfig";

const ROOT = path.resolve(__dirname, "..");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const FALLBACK_MYSQL_DATABASE_URL = "mysql://root:password@127.0.0.1:3306/prowriter";

applyRuntimeConfigDefaults();
ensureLocalDataDir(ROOT);

const commandEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL?.trim() || FALLBACK_MYSQL_DATABASE_URL,
  PRISMA_HIDE_UPDATE_MESSAGE: "true",
};

function runPrisma(args: string[]): void {
  execFileSync(NPX, ["prisma", ...args], {
    cwd: ROOT,
    env: commandEnv,
    stdio: "inherit",
  });
}

function capturePrisma(args: string[]): string {
  return execFileSync(NPX, ["prisma", ...args], {
    cwd: ROOT,
    env: commandEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) =>
      statement
        .split(/\r?\n/)
        .some((line) => {
          const trimmed = line.trim();
          return trimmed && !trimmed.startsWith("--");
        })
    );
}

function makeSqliteBootstrapStatementIdempotent(statement: string): string {
  return statement
    .replace(/\bCREATE TABLE\b/g, "CREATE TABLE IF NOT EXISTS")
    .replace(/\bCREATE UNIQUE INDEX\b/g, "CREATE UNIQUE INDEX IF NOT EXISTS")
    .replace(/\bCREATE INDEX\b/g, "CREATE INDEX IF NOT EXISTS");
}

async function applySqliteSchemaWithClient() {
  const sql = capturePrisma([
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    "prisma/schema-sqlite.prisma",
    "--script",
  ]);
  const statements = splitSqlStatements(sql);
  const { PrismaClient } = await import("../src/lib/prisma-sqlite");
  const client = new PrismaClient();

  try {
    for (const statement of statements) {
      await client.$executeRawUnsafe(makeSqliteBootstrapStatementIdempotent(statement));
    }
  } finally {
    await client.$disconnect();
  }
}

async function pushSqliteSchema() {
  try {
    runPrisma(["db", "push", "--schema=prisma/schema-sqlite.prisma"]);
  } catch (error) {
    console.warn("[setup-local] Prisma db push failed; applying SQLite schema with local fallback.");
    await applySqliteSchemaWithClient();
  }
}

export async function ensureLocalConfig() {
  console.log("[setup-local] Generating Prisma Client...");
  runPrisma(["generate"]);

  console.log("[setup-local] Generating SQLite Prisma Client...");
  runPrisma(["generate", "--schema=prisma/schema-sqlite.prisma"]);

  console.log("[setup-local] Pushing SQLite schema...");
  await pushSqliteSchema();

  console.log("[setup-local] Local fallback database is ready.");
}

if (require.main === module) {
  ensureLocalConfig().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
