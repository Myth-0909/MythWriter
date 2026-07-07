import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import prisma from "../lib/prisma";
import { t } from "../lib/i18n";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

// All group routes require authentication
router.use(authMiddleware);

// GET /api/groups - List all groups for the current user
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const groups = await prisma.documentGroup.findMany({
      where: { userId: req.user!.userId },
      include: {
        documents: {
          where: { isDeleted: false },
          select: {
            id: true,
            title: true,
            preview: true,
            category: true,
            isFavorite: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ groups });
  } catch (error) {
    console.error("List groups error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取分组列表失败", "Failed to load groups") });
  }
});

// POST /api/groups - Create a new document group
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: t(requestLang(req), "分组名称不能为空", "Group name cannot be empty") });
      return;
    }

    const group = await prisma.documentGroup.create({
      data: {
        name,
        userId: req.user!.userId,
      },
    });

    res.json({ group });
  } catch (error) {
    console.error("Create group error:", error);
    res.status(500).json({ error: t(requestLang(req), "创建分组失败", "Failed to create group") });
  }
});

// PUT /api/groups/:id - Rename a group
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: t(requestLang(req), "分组名称不能为空", "Group name cannot be empty") });
      return;
    }

    const group = await prisma.documentGroup.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!group) {
      res.status(404).json({ error: t(requestLang(req), "分组不存在", "Group not found") });
      return;
    }

    const updated = await prisma.documentGroup.update({
      where: { id: group.id },
      data: { name },
    });

    res.json({ group: updated });
  } catch (error) {
    console.error("Rename group error:", error);
    res.status(500).json({ error: t(requestLang(req), "重命名分组失败", "Failed to rename group") });
  }
});

// DELETE /api/groups/:id - Delete a group (Set related documents' groupId to null automatically via Prisma schema onDelete: SetNull)
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const group = await prisma.documentGroup.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!group) {
      res.status(404).json({ error: t(requestLang(req), "分组不存在", "Group not found") });
      return;
    }

    await prisma.documentGroup.delete({
      where: { id: group.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete group error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除分组失败", "Failed to delete group") });
  }
});

// POST /api/groups/:id/add - Add documents to a group
router.post("/:id/add", async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    if (!Array.isArray(documentIds)) {
      res.status(400).json({ error: t(requestLang(req), "文档ID列表必须是数组", "Document ID list must be an array") });
      return;
    }

    const group = await prisma.documentGroup.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!group) {
      res.status(404).json({ error: t(requestLang(req), "分组不存在", "Group not found") });
      return;
    }

    // Update documents to belong to this group (verify they belong to this user too)
    await prisma.document.updateMany({
      where: {
        id: { in: documentIds },
        userId: req.user!.userId,
      },
      data: {
        groupId: group.id,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Add documents to group error:", error);
    res.status(500).json({ error: t(requestLang(req), "添加文档至分组失败", "Failed to add documents to group") });
  }
});

// POST /api/groups/:id/remove - Remove documents from a group (Sets their groupId to null)
router.post("/:id/remove", async (req: AuthRequest, res: Response) => {
  try {
    const { documentIds } = req.body;
    if (!Array.isArray(documentIds)) {
      res.status(400).json({ error: t(requestLang(req), "文档ID列表必须是数组", "Document ID list must be an array") });
      return;
    }

    const group = await prisma.documentGroup.findFirst({
      where: { id: String(req.params.id), userId: req.user!.userId },
    });

    if (!group) {
      res.status(404).json({ error: t(requestLang(req), "分组不存在", "Group not found") });
      return;
    }

    // Update documents to remove their groupId
    await prisma.document.updateMany({
      where: {
        id: { in: documentIds },
        userId: req.user!.userId,
        groupId: group.id,
      },
      data: {
        groupId: null,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Remove documents from group error:", error);
    res.status(500).json({ error: t(requestLang(req), "移出分组失败", "Failed to remove documents from group") });
  }
});

export default router;
