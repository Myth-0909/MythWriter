import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import { getProfile, updateProfile, uploadAvatar, getApiKey, saveApiKey } from "../services/userService";

const router = Router();

router.use(authMiddleware);

// GET /api/users/me - Get current user profile
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const user = await getProfile(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: "用户不存在" });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "获取用户信息失败" });
  }
});

// PUT /api/users/me - Update current user profile
router.put("/me", async (req: AuthRequest, res: Response) => {
  try {
    const result = await updateProfile(req.user!.userId, req.body);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ user: result.user });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "更新用户信息失败" });
  }
});

// POST /api/users/avatar - Upload avatar (base64)
router.post("/avatar", async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: "请选择图片" });
      return;
    }

    const result = await uploadAvatar(req.user!.userId, image);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ user: result.user, avatarUrl: result.avatarUrl });
  } catch (error) {
    console.error("Upload avatar error:", error);
    res.status(500).json({ error: "上传头像失败" });
  }
});

// GET /api/users/me/apikey - Get API key (masked)
router.get("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const result = await getApiKey(req.user!.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: t("zh", "获取API Key失败", "Failed to get API Key") });
  }
});

// PUT /api/users/me/apikey - Save API key
router.put("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    const current = await getApiKey(req.user!.userId);
    if ((!apiKey || !apiKey.trim()) && !current.hasKey) {
      res.status(400).json({ error: t("zh", "API Key不能为空", "API Key is required") });
      return;
    }
    if (!baseUrl || !baseUrl.trim()) {
      res.status(400).json({ error: t("zh", "Base URL不能为空", "Base URL is required") });
      return;
    }
    if (!/^https?:\/\//i.test(baseUrl.trim())) {
      res.status(400).json({ error: t("zh", "Base URL必须以http://或https://开头", "Base URL must start with http:// or https://") });
      return;
    }
    if (!model || !model.trim()) {
      res.status(400).json({ error: t("zh", "模型名称不能为空", "Model is required") });
      return;
    }
    await saveApiKey(req.user!.userId, {
      ...(apiKey?.trim() && { apiKey }),
      baseUrl,
      model,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: t("zh", "保存API Key失败", "Failed to save API Key") });
  }
});

export default router;
