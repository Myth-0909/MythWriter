import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";

const router = Router();

router.use(authMiddleware);

// GET /api/ai/categories - List all categories for the user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.aIBrainCategory.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "asc" },
    });
    res.json({ categories });
  } catch (error) {
    console.error("List brain categories error:", error);
    res.status(500).json({ error: "获取类别列表失败" });
  }
});

// POST /api/ai/categories - Create a new category
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "类别名称不能为空" });
      return;
    }
    const category = await prisma.aIBrainCategory.create({
      data: {
        name: name.trim(),
        color: color || null,
        userId: req.user!.userId,
      },
    });
    res.json({ category });
  } catch (error) {
    console.error("Create brain category error:", error);
    res.status(500).json({ error: "创建类别失败" });
  }
});

// PUT /api/ai/categories/:id - Update a category
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    const existing = await prisma.aIBrainCategory.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "该类别不存在" });
      return;
    }
    const updated = await prisma.aIBrainCategory.update({
      where: { id: existing.id },
      data: {
        ...(name && { name: name.trim() }),
        ...(color !== undefined && { color: color || null }),
      },
    });
    res.json({ category: updated });
  } catch (error) {
    console.error("Update brain category error:", error);
    res.status(500).json({ error: "更新类别失败" });
  }
});

// DELETE /api/ai/categories/:id - Delete a category (sets knowledge categoryId to null)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.aIBrainCategory.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: "该类别不存在" });
      return;
    }
    await prisma.aIBrainCategory.delete({
      where: { id: existing.id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete brain category error:", error);
    res.status(500).json({ error: "删除类别失败" });
  }
});

export default router;
