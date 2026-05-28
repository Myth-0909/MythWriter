import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";

const router = Router();

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
    res.status(500).json({ error: "获取设定卡列表失败" });
  }
});

// POST /api/ai/knowledge - Create a new knowledge entry
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category } = req.body;
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "设定名称不能为空" });
      return;
    }
    if (!description || typeof description !== "string") {
      res.status(400).json({ error: "设定内容描述不能为空" });
      return;
    }

    const knowledge = await prisma.aIBrainKnowledge.create({
      data: {
        title,
        description,
        category: category || "character",
        userId: req.user!.userId,
      },
    });

    res.json({ knowledge });
  } catch (error) {
    console.error("Create brain knowledge error:", error);
    res.status(500).json({ error: "创建设定卡失败" });
  }
});

// PUT /api/ai/knowledge/:id - Update a knowledge entry
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, category } = req.body;
    
    const knowledge = await prisma.aIBrainKnowledge.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!knowledge) {
      res.status(404).json({ error: "该设定卡不存在" });
      return;
    }

    const updated = await prisma.aIBrainKnowledge.update({
      where: { id: knowledge.id },
      data: {
        title: title !== undefined ? title : knowledge.title,
        description: description !== undefined ? description : knowledge.description,
        category: category !== undefined ? category : knowledge.category,
      },
    });

    res.json({ knowledge: updated });
  } catch (error) {
    console.error("Update brain knowledge error:", error);
    res.status(500).json({ error: "更新设定卡失败" });
  }
});

// DELETE /api/ai/knowledge/:id - Delete a knowledge entry
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const knowledge = await prisma.aIBrainKnowledge.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!knowledge) {
      res.status(404).json({ error: "该设定卡不存在" });
      return;
    }

    await prisma.aIBrainKnowledge.delete({
      where: { id: knowledge.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete brain knowledge error:", error);
    res.status(500).json({ error: "删除设定卡失败" });
  }
});

export default router;
