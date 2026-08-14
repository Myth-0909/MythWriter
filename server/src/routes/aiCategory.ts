import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { t } from "../lib/i18n";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

router.use(authMiddleware);

// GET /api/ai/categories - List all categories for the user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const categories = await prisma.aIBrainCategory.findMany({
      where: { userId: req.user!.userId },
      orderBy: { sortOrder: "asc" },
    });
    res.json({ categories });
  } catch (error) {
    console.error("List brain categories error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取分类失败", "Failed to list categories") });
  }
});

// POST /api/ai/categories - Create a new category
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: t(requestLang(req), "分类名称不能为空", "Category name cannot be empty") });
      return;
    }
    // Auto-assign sortOrder as the next available position
    const maxSort = await prisma.aIBrainCategory.findFirst({
      where: { userId: req.user!.userId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const category = await prisma.aIBrainCategory.create({
      data: {
        name: name.trim(),
        color: color || null,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        userId: req.user!.userId,
      },
    });
    res.json({ category });
  } catch (error) {
    console.error("Create brain category error:", error);
    res.status(500).json({ error: t(requestLang(req), "创建分类失败", "Failed to create category") });
  }
});

// PUT /api/ai/categories/reorder - Batch update sort order (MUST be before /:id)
router.put("/reorder", async (req: AuthRequest, res: Response) => {
  try {
    const { items }: { items: { id: string; sortOrder: number }[] } = req.body;
    console.log("[reorder] items:", JSON.stringify(items));
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: t(requestLang(req), "排序项目不能为空", "Items array is required") });
      return;
    }
    if (!req.user?.userId) {
      console.error("[reorder] Missing user ID");
      res.status(401).json({ error: t(requestLang(req), "未登录", "Unauthorized") });
      return;
    }
    const userId = req.user.userId;
    await prisma.$transaction(async (tx: typeof prisma) => {
      for (const item of items) {
        await tx.aIBrainCategory.updateMany({
          where: { id: item.id, userId },
          data: { sortOrder: item.sortOrder },
        });
      }
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Reorder brain categories error:", error);
    res.status(500).json({ error: t(requestLang(req), "分类排序失败", "Failed to reorder categories"), code: "CATEGORY_REORDER_FAILED" });
  }
});

// PUT /api/ai/categories/:id - Update a category
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, sortOrder } = req.body;
    const existing = await prisma.aIBrainCategory.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: t(requestLang(req), "分类不存在", "Category not found") });
      return;
    }
    const nextName = typeof name === "string" && name.trim() ? name.trim() : existing.name;
    const [updated] = await prisma.$transaction([
      prisma.aIBrainCategory.update({
        where: { id: existing.id },
        data: {
          ...(name && { name: nextName }),
          ...(color !== undefined && { color: color || null }),
          ...(sortOrder !== undefined && { sortOrder }),
        },
      }),
      prisma.aIBrainKnowledge.updateMany({
        where: {
          userId: req.user!.userId,
          OR: [
            { categoryId: existing.id },
            { category: existing.name },
          ],
        },
        data: {
          category: nextName,
          categoryId: existing.id,
        },
      }),
    ]);
    res.json({ category: updated });
  } catch (error) {
    console.error("Update brain category error:", error);
    res.status(500).json({ error: t(requestLang(req), "更新分类失败", "Failed to update category") });
  }
});

// DELETE /api/ai/categories/:id - Delete a category (sets knowledge categoryId to null)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.aIBrainCategory.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });
    if (!existing) {
      res.status(404).json({ error: t(requestLang(req), "分类不存在", "Category not found") });
      return;
    }
    await prisma.aIBrainCategory.delete({
      where: { id: existing.id },
    });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete brain category error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除分类失败", "Failed to delete category") });
  }
});

export default router;
