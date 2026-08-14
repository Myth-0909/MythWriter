import "dotenv/config";
import { applyRuntimeConfigDefaults } from "./lib/runtimeConfig";
import express from "express";
import path from "path";
import cors from "cors";
import authRoutes from "./routes/auth";
import documentRoutes from "./routes/documents";
import userRoutes from "./routes/users";
import statsRoutes from "./routes/stats";
import aiRoutes from "./routes/ai";
import sessionRoutes from "./routes/session";
import groupsRoutes from "./routes/groups";
import spreadsheetRoutes from "./routes/spreadsheets";
import aiKnowledgeRoutes from "./routes/aiKnowledge";
import aiCategoryRoutes from "./routes/aiCategory";
import ragRoutes from "./routes/rag";
import workRecordRoutes from "./routes/workRecords";
import { connectRedis } from "./lib/redis";
import prisma from "./lib/prisma";
import { getMilvusStatus } from "./lib/milvus";
import { startWorkRecordSummaryScheduler } from "./services/workRecordSummaryService";
import { startTrashCleanupScheduler } from "./services/trashCleanupService";

applyRuntimeConfigDefaults();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// CORS: when CORS_ORIGINS is configured (comma-separated), restrict to that
// allowlist; otherwise stay permissive for local/desktop (Tauri) usage.
// Requests without an Origin header (native apps, curl) are always allowed.
const corsAllowlist = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsAllowlist.length === 0 || corsAllowlist.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// Baseline security headers (avoids pulling in a full helmet dependency).
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  next();
});

app.use(express.json({ limit: "10mb" }));

// Static files for uploaded avatars
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/session", sessionRoutes);
app.use("/api/groups", groupsRoutes);
app.use("/api/spreadsheets", spreadsheetRoutes);
app.use("/api/ai/knowledge", aiKnowledgeRoutes);
app.use("/api/ai/categories", aiCategoryRoutes);
app.use("/api/rag", ragRoutes);
app.use("/api/work-records", workRecordRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function start() {
  // Warm database connection before accepting requests
  try {
    await prisma.$connect();
    console.log("[DB] Connection pool ready");
  } catch (err: any) {
    console.warn("[DB] Warm-up failed:", err.message);
  }

  await connectRedis();

  const milvusStatus = await getMilvusStatus();
  if (milvusStatus.available) {
    console.log("[Milvus] Vector collections ready");
  } else {
    console.warn("[Milvus] Vector setup unavailable:", milvusStatus.error);
  }

  startWorkRecordSummaryScheduler();
  startTrashCleanupScheduler();

  app.listen(PORT, HOST, () => {
    const localHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`ZNWriter API server running on http://${localHost}:${PORT}`);
    console.log(`Health check: http://${localHost}:${PORT}/api/health`);
  });
}

start();
