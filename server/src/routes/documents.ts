import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import {
  createDocument, getDocument, listDocuments, listFavorites, listTrash,
  updateDocument, toggleFavorite, moveToTrash, restoreFromTrash,
  permanentlyDelete, emptyTrash, createDocumentVersion, listDocumentVersions,
  restoreDocumentVersion,
} from "../services/documentService";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

// All routes require authentication
router.use(authMiddleware);

// GET /api/documents - List user's active documents
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const documents = await listDocuments(req.user!.userId);
    res.json({ documents });
  } catch (error) {
    console.error("List documents error:", error);
    res.status(500).json({ error: "获取文档列表失败" });
  }
});

// GET /api/documents/favorites - List user's favorite documents
router.get("/favorites", async (req: AuthRequest, res: Response) => {
  try {
    const documents = await listFavorites(req.user!.userId);
    res.json({ documents });
  } catch (error) {
    console.error("List favorites error:", error);
    res.status(500).json({ error: "获取收藏列表失败" });
  }
});

// GET /api/documents/trash - List user's trashed documents
router.get("/trash", async (req: AuthRequest, res: Response) => {
  try {
    const documents = await listTrash(req.user!.userId);
    res.json({ documents });
  } catch (error) {
    console.error("List trash error:", error);
    res.status(500).json({ error: "获取回收站列表失败" });
  }
});

// GET /api/documents/:id/versions - List document versions
router.get("/:id/versions", async (req: AuthRequest, res: Response) => {
  try {
    const versions = await listDocumentVersions(String(req.params.id), req.user!.userId);
    if (!versions) {
      res.status(404).json({ error: t(requestLang(req), "文档不存在", "Document not found") });
      return;
    }
    res.json({ versions });
  } catch (error) {
    console.error("List document versions error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取版本记录失败", "Failed to load version history") });
  }
});

// POST /api/documents/:id/versions - Save a version snapshot
router.post("/:id/versions", async (req: AuthRequest, res: Response) => {
  try {
    const version = await createDocumentVersion(String(req.params.id), req.user!.userId, req.body?.source || "manual");
    if (!version) {
      res.status(404).json({ error: t(requestLang(req), "文档不存在", "Document not found") });
      return;
    }
    res.status(201).json({ version });
  } catch (error) {
    console.error("Create document version error:", error);
    res.status(500).json({ error: t(requestLang(req), "保存版本快照失败", "Failed to save version snapshot") });
  }
});

// PATCH /api/documents/:id/versions/:versionId/restore - Restore a version
router.patch("/:id/versions/:versionId/restore", async (req: AuthRequest, res: Response) => {
  try {
    const document = await restoreDocumentVersion(String(req.params.id), String(req.params.versionId), req.user!.userId);
    if (!document) {
      res.status(404).json({ error: t(requestLang(req), "版本不存在", "Version not found") });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Restore document version error:", error);
    res.status(500).json({ error: t(requestLang(req), "恢复版本失败", "Failed to restore version") });
  }
});

// GET /api/documents/:id - Get a single document
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const document = await getDocument(String(req.params.id), req.user!.userId);
    if (!document) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({ error: "获取文档失败" });
  }
});

// POST /api/documents - Create a new document
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const document = await createDocument(req.user!.userId, req.body);
    res.status(201).json({ document });
  } catch (error) {
    console.error("Create document error:", error);
    res.status(500).json({ error: "创建文档失败" });
  }
});

// PUT /api/documents/:id - Update a document
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const document = await updateDocument(String(req.params.id), req.user!.userId, req.body);
    if (!document) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Update document error:", error);
    res.status(500).json({ error: "更新文档失败" });
  }
});

// PATCH /api/documents/:id/favorite - Toggle favorite
router.patch("/:id/favorite", async (req: AuthRequest, res: Response) => {
  try {
    const document = await toggleFavorite(String(req.params.id), req.user!.userId);
    if (!document) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    res.status(500).json({ error: "操作失败" });
  }
});

// PATCH /api/documents/:id/trash - Move to trash
router.patch("/:id/trash", async (req: AuthRequest, res: Response) => {
  try {
    const document = await moveToTrash(String(req.params.id), req.user!.userId);
    if (!document) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Move to trash error:", error);
    res.status(500).json({ error: "操作失败" });
  }
});

// PATCH /api/documents/:id/restore - Restore from trash
router.patch("/:id/restore", async (req: AuthRequest, res: Response) => {
  try {
    const document = await restoreFromTrash(String(req.params.id), req.user!.userId);
    if (!document) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ document });
  } catch (error) {
    console.error("Restore error:", error);
    res.status(500).json({ error: "操作失败" });
  }
});

// DELETE /api/documents/trash/empty - Empty trash
router.delete("/trash/empty", async (req: AuthRequest, res: Response) => {
  try {
    await emptyTrash(req.user!.userId);
    res.json({ success: true });
  } catch (error) {
    console.error("Empty trash error:", error);
    res.status(500).json({ error: "清空回收站失败" });
  }
});

// DELETE /api/documents/:id - Permanently delete
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await permanentlyDelete(String(req.params.id), req.user!.userId);
    if (!deleted) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "删除文档失败" });
  }
});

export default router;
