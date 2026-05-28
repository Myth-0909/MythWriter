import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import { getProfile, updateProfile, uploadAvatar, getApiKey, saveApiKey, fetchModels, getApiKeySecret, listApiKeyHistories, applyApiKeyHistory } from "../services/userService";

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

// GET /api/users/me/apikey/history - List saved AI service configurations
router.get("/me/apikey/history", async (req: AuthRequest, res: Response) => {
  try {
    const histories = await listApiKeyHistories(req.user!.userId);
    res.json({ histories });
  } catch (error) {
    res.status(500).json({ error: t("zh", "获取历史配置失败", "Failed to get saved configurations") });
  }
});

// POST /api/users/me/apikey/history/:id/apply - Apply a saved AI service configuration
router.post("/me/apikey/history/:id/apply", async (req: AuthRequest, res: Response) => {
  try {
    const result = await applyApiKeyHistory(req.user!.userId, String(req.params.id));
    if (!result) {
      res.status(404).json({ error: t("zh", "历史配置不存在", "Saved configuration not found") });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: t("zh", "切换历史配置失败", "Failed to apply saved configuration") });
  }
});

// POST /api/users/me/models - Fetch OpenAI-compatible model list by Base URL
router.post("/me/models", async (req: AuthRequest, res: Response) => {
  try {
    const current = await getApiKey(req.user!.userId);
    const baseUrl = typeof req.body.baseUrl === "string" && req.body.baseUrl.trim()
      ? req.body.baseUrl.trim()
      : current.baseUrl;
    const apiKey = typeof req.body.apiKey === "string" && req.body.apiKey.trim()
      ? req.body.apiKey.trim()
      : await getApiKeySecret(req.user!.userId);

    if (!/^https?:\/\//i.test(baseUrl)) {
      res.status(400).json({ error: t("zh", "Base URL必须以http://或https://开头", "Base URL must start with http:// or https://") });
      return;
    }

    const models = await fetchModels(baseUrl, apiKey);
    res.json({ models });
  } catch (error) {
    console.error("Fetch models error:", error);
    res.status(502).json({ error: t("zh", "获取模型列表失败", "Failed to fetch model list") });
  }
});

// PUT /api/users/me/apikey - Save API key
router.put("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    const current = await getApiKey(req.user!.userId);
    const nextBaseUrl = typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : current.baseUrl;
    const nextModel = typeof model === "string" && model.trim() ? model.trim() : current.model;

    if (!/^https?:\/\//i.test(nextBaseUrl)) {
      res.status(400).json({ error: t("zh", "Base URL必须以http://或https://开头", "Base URL must start with http:// or https://") });
      return;
    }

    await saveApiKey(req.user!.userId, {
      ...((!current.hasKey || apiKey !== undefined) && { apiKey: apiKey || "" }),
      baseUrl: nextBaseUrl,
      model: nextModel,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: t("zh", "保存API Key失败", "Failed to save API Key") });
  }
});

export default router;
