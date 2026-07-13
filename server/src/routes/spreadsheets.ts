import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import {
  createSpreadsheet,
  getSpreadsheet,
  listSpreadsheets,
  moveSpreadsheetToTrash,
  updateSpreadsheet,
} from "../services/spreadsheetService";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

function defaultSpreadsheetTitle(req: AuthRequest) {
  return t(requestLang(req), "未命名表格", "Untitled spreadsheet");
}

router.use(authMiddleware);

router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheets = await listSpreadsheets(req.user!.userId);
    res.json({ spreadsheets });
  } catch (error) {
    console.error("List spreadsheets error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取表格列表失败", "Failed to load spreadsheets") });
  }
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await getSpreadsheet(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Spreadsheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error) {
    console.error("Get spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取表格失败", "Failed to load spreadsheet") });
  }
});

router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await createSpreadsheet(req.user!.userId, req.body || {}, defaultSpreadsheetTitle(req));
    res.status(201).json({ spreadsheet });
  } catch (error) {
    console.error("Create spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "创建表格失败", "Failed to create spreadsheet") });
  }
});

router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await updateSpreadsheet(
      String(req.params.id),
      req.user!.userId,
      req.body || {},
      defaultSpreadsheetTitle(req)
    );
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Spreadsheet not found") });
      return;
    }
    res.json({ spreadsheet });
  } catch (error) {
    console.error("Update spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "更新表格失败", "Failed to update spreadsheet") });
  }
});

router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const spreadsheet = await moveSpreadsheetToTrash(String(req.params.id), req.user!.userId);
    if (!spreadsheet) {
      res.status(404).json({ error: t(requestLang(req), "表格不存在", "Spreadsheet not found") });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete spreadsheet error:", error);
    res.status(500).json({ error: t(requestLang(req), "删除表格失败", "Failed to delete spreadsheet") });
  }
});

export default router;
