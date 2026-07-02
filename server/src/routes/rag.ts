import { Router, Response } from "express";
import { AuthRequest, authMiddlewareWithBlacklist } from "../middleware/auth";
import { t } from "../lib/i18n";
import prisma from "../lib/prisma";
import { getMilvusStatus } from "../lib/milvus";
import { ragService } from "../services/ragService";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

function parseTopK(value: unknown, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function requireQuery(req: AuthRequest, res: Response): string | null {
  const lang = requestLang(req);
  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: t(lang, "检索内容不能为空", "Search query cannot be empty") });
    return null;
  }
  return query;
}

router.use(authMiddlewareWithBlacklist);

router.get("/status", async (_req: AuthRequest, res: Response) => {
  const status = await getMilvusStatus();
  res.json(status);
});

router.post("/search-knowledge", async (req: AuthRequest, res: Response) => {
  const query = requireQuery(req, res);
  if (!query) return;

  const result = await ragService.searchKnowledge(
    req.user!.userId,
    query,
    parseTopK(req.body?.topK),
    () => prisma.aIBrainKnowledge.findMany({
      where: { userId: req.user!.userId },
      select: { id: true, title: true, description: true, category: true },
    })
  );
  res.json(result);
});

router.post("/search-documents", async (req: AuthRequest, res: Response) => {
  const query = requireQuery(req, res);
  if (!query) return;

  const result = await ragService.searchDocuments(
    req.user!.userId,
    query,
    parseTopK(req.body?.topK)
  );
  res.json(result);
});

router.post("/reindex-knowledge/:id", async (req: AuthRequest, res: Response) => {
  const lang = requestLang(req);
  const knowledge = await prisma.aIBrainKnowledge.findFirst({
    where: { id: String(req.params.id), userId: req.user!.userId },
    select: { id: true, title: true, description: true, userId: true },
  });
  if (!knowledge) {
    res.status(404).json({ error: t(lang, "设定卡不存在", "Knowledge card not found") });
    return;
  }

  const result = await ragService.reindexKnowledge(knowledge);
  res.json(result);
});

router.post("/reindex-document/:id", async (req: AuthRequest, res: Response) => {
  const lang = requestLang(req);
  const document = await prisma.document.findFirst({
    where: { id: String(req.params.id), userId: req.user!.userId, isDeleted: false },
    select: { id: true, content: true, userId: true },
  });
  if (!document) {
    res.status(404).json({ error: t(lang, "文档不存在", "Document not found") });
    return;
  }

  const result = await ragService.reindexDocument(document);
  res.json(result);
});

router.post("/reindex-all", async (req: AuthRequest, res: Response) => {
  const knowledges = await prisma.aIBrainKnowledge.findMany({
    where: { userId: req.user!.userId },
    select: { id: true, title: true, description: true, userId: true },
  });

  let indexed = 0;
  let failed = 0;
  for (const knowledge of knowledges) {
    const result = await ragService.reindexKnowledge(knowledge);
    if (result.indexed) indexed += 1;
    else failed += 1;
  }

  res.json({ indexed, failed, total: knowledges.length });
});

export default router;
