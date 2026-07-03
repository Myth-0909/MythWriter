import "dotenv/config";
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
import aiKnowledgeRoutes from "./routes/aiKnowledge";
import aiCategoryRoutes from "./routes/aiCategory";
import ragRoutes from "./routes/rag";
import workRecordRoutes from "./routes/workRecords";
import { connectRedis } from "./lib/redis";
import prisma from "./lib/prisma";
import { getMilvusStatus } from "./lib/milvus";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
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

  app.listen(PORT, () => {
    console.log(`ZNWriter API server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
  });
}

start();
