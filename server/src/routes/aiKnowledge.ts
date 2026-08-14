import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { ragService } from "../services/ragService";
import { t } from "../lib/i18n";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

function queueKnowledgeReindex(knowledge: { id: string; userId: string; title: string; description: string }) {
  void ragService.reindexKnowledge(knowledge).then((result) => {
    if (!result.indexed) {
      console.warn(`[RAG] Failed to index knowledge ${knowledge.id}: ${result.error}`);
    }
  });
}

function queueKnowledgeVectorDelete(knowledgeId: string) {
  void ragService.deleteKnowledgeVectors(knowledgeId).then((result) => {
    if (!result.deleted) {
      console.warn(`[RAG] Failed to delete knowledge vector ${knowledgeId}: ${result.error}`);
    }
  });
}

// All routes require authentication
router.use(authMiddleware);

// GET /api/ai/knowledge - List all knowledge entries for the user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const knowledges = await prisma.aIBrainKnowledge.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
    });
    res.json({ knowledges });
  } catch (error) {
    console.error("List brain knowledge error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取设定卡列表失败", "Failed to list knowledge cards") });
  }
});

// POST /api/ai/knowledge - Create a new knowledge entry
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, categoryId } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: t(requestLang(req), "设定名称不能为空", "Knowledge title is required") });
      return;
    }
    if (!description || typeof description !== "string") {
      res.status(400).json({ error: t(requestLang(req), "设定内容描述不能为空", "Knowledge description is required") });
      return;
    }

    const categoryRef = categoryId
      ? await prisma.aIBrainCategory.findFirst({
          where: { id: String(categoryId), userId: req.user!.userId },
        })
      : null;

    const knowledge = await prisma.aIBrainKnowledge.create({
      data: {
        title,
        description,
        category: categoryRef?.name || category || "",
        categoryId: categoryRef?.id || null,
        userId: req.user!.userId,
      },
    });

    queueKnowledgeReindex(knowledge);
    res.json({ knowledge });
  } catch (error) {
    console.error("Create brain knowledge error:", error);
    res.status(500).json({ error: t(requestLang(req), "创建设定卡失败", "Failed to create knowledge card") });
  }
});

// PUT /api/ai/knowledge/:id - Update a knowledge entry
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category, categoryId } = req.body;
    
    const knowledge = await prisma.aIBrainKnowledge.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!knowledge) {
      res.status(404).json({ error: t(requestLang(req), "该设定卡不存在", "Knowledge card not found") });
      return;
    }

    const categoryRef = categoryId
      ? await prisma.aIBrainCategory.findFirst({
          where: { id: String(categoryId), userId: req.user!.userId },
        })
      : null;

    const updated = await prisma.aIBrainKnowledge.update({
      where: { id: knowledge.id },
      data: {
        title: title !== undefined ? title : knowledge.title,
        description: description !== undefined ? description : knowledge.description,
        ...(categoryId !== undefined
          ? { category: categoryRef?.name || "", categoryId: categoryRef?.id || null }
          : category !== undefined
            ? { category }
            : {}),
      },
    });

    queueKnowledgeReindex(updated);
    res.json({ knowledge: updated });
  } catch (error) {
    console.error("Update brain knowledge error:", error);
    res.status(500).json({ error: t(requestLang(req), "更新设定卡失败", "Failed to update knowledge card") });
  }
});

// DELETE /api/ai/knowledge/:id - Delete a knowledge entry
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const knowledge = await prisma.aIBrainKnowledge.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!knowledge) {
      res.status(404).json({ error: t(requestLang(req), "该设定卡不存在", "Knowledge card not found") });
      return;
    }

    await prisma.aIBrainKnowledge.delete({
      where: { id: knowledge.id },
    });

    queueKnowledgeVectorDelete(knowledge.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete brain knowledge error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除设定卡失败", "Failed to delete knowledge card") });
  }
});

export default router;
