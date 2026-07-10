import { PrismaClient as MySQLPrismaClient } from "@prisma/client";
import { applyRuntimeConfigDefaults, ensureLocalDataDir } from "./runtimeConfig";

applyRuntimeConfigDefaults();

let realClient: any = null;
let initPromise: Promise<any> | null = null;

function isMissingGeneratedSqliteClient(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND" &&
    error.message.includes("prisma-sqlite")
  );
}

async function loadSQLitePrismaClient(): Promise<any> {
  try {
    return await import("./prisma-sqlite");
  } catch (error) {
    if (isMissingGeneratedSqliteClient(error)) {
      return import("../../src/lib/prisma-sqlite");
    }
    throw error;
  }
}

async function connectToMySQL(): Promise<any> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is not configured");
  }
  const client = new MySQLPrismaClient({ log: ["warn", "error"] });
  await Promise.race([
    client.$connect(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("MySQL connection timeout (5s)")), 5000)
    ),
  ]);
  console.log("[DB] Connected to MySQL");
  return client;
}

async function connectToSQLite(): Promise<any> {
  ensureLocalDataDir();
  const { PrismaClient: SQLitePrismaClient } = await loadSQLitePrismaClient();
  const client = new SQLitePrismaClient({ log: ["warn", "error"] });
  await client.$connect();
  console.log("[DB] Connected to SQLite (local fallback)");
  return client;
}

function getClient(): Promise<any> {
  if (realClient) return Promise.resolve(realClient);
  if (!initPromise) {
    initPromise = (async () => {
      try {
        realClient = await connectToMySQL();
      } catch (mysqlErr) {
        console.warn(
          `[DB] MySQL unavailable: ${(mysqlErr as Error).message}`
        );
        console.warn("[DB] Falling back to local SQLite database...");
        try {
          realClient = await connectToSQLite();
        } catch (sqliteErr) {
          console.error("[DB] SQLite also failed:", sqliteErr);
          throw new Error(
            "No database available. Please ensure MySQL is running, " +
            "or run: npm run setup-sqlite"
          );
        }
      }
      return realClient;
    })();
  }
  return initPromise;
}

const prisma = new Proxy({} as any, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== "string") return undefined;

    if (prop.startsWith("$")) {
      return (...args: any[]) =>
        getClient().then((c) => c[prop](...args));
    }

    return new Proxy({} as any, {
      get(_modelTarget, method: string) {
        if (typeof method !== "string") return undefined;
        return (...args: any[]) =>
          getClient().then((c) => c[prop][method](...args));
      },
    });
  },
});

export default prisma;
