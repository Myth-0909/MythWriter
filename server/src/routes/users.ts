import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  getApiKey,
  saveApiKey,
  fetchModels,
  getApiKeySecret,
  listApiKeyHistories,
  applyApiKeyHistory,
  deleteApiKeyHistory,
  getEmbeddingConfig,
  saveEmbeddingConfig,
  testChatModel,
} from "../services/userService";
import { isAiProviderHttpUrl } from "../lib/safeOutboundUrl";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

/**
 * Accepts explicit public, localhost, and LAN model endpoints while rejecting
 * non-http protocols, embedded credentials, and metadata/special targets.
 */
function ensureSafeBaseUrl(url: string, res: Response, lang: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: t(lang, "Base URL必须以http://或https://开头", "Base URL must start with http:// or https://") });
    return false;
  }
  if (!isAiProviderHttpUrl(url)) {
    res.status(400).json({ error: t(lang, "Base URL 指向了不安全或无效的地址", "Base URL points to an unsafe or invalid address") });
    return false;
  }
  return true;
}

function connectivityErrorMessage(error: unknown, lang: string): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|network/i.test(message)) {
    return t(lang, "无法连接模型服务，请检查网络或代理设置", "Could not reach the model service. Check your network or proxy settings.");
  }
  if (/returned\s+40[13]\b/i.test(message)) {
    return t(lang, "模型服务拒绝了 API Key，请确认 Key 是否有效", "The model service rejected the API key. Check that the key is valid.");
  }
  if (/returned\s+404\b/i.test(message)) {
    return t(lang, "模型接口或模型名称不存在，请检查 Base URL 和模型名称", "The model endpoint or model was not found. Check the Base URL and model name.");
  }
  if (/returned\s+429\b/i.test(message)) {
    return t(lang, "模型服务请求过于频繁或额度不足，请稍后重试", "The model service is rate-limited or out of quota. Try again later.");
  }
  return t(lang, "模型连通性测试失败，请检查 Base URL、模型名称和 API Key", "Model connectivity test failed. Check Base URL, model, and API Key.");
}

router.use(authMiddleware);

// GET /api/users/me - Get current user profile
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const user = await getProfile(req.user!.userId);
    if (!user) {
      res.status(404).json({ error: t(requestLang(req), "用户不存在", "User not found") });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: t(requestLang(req), "获取用户信息失败", "Failed to load profile") });
  }
});

// PUT /api/users/me - Update current user profile
router.put("/me", async (req: AuthRequest, res: Response) => {
  try {
    const result = await updateProfile(req.user!.userId, req.body, requestLang(req));
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ user: result.user });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: t(requestLang(req), "更新用户信息失败", "Failed to update profile") });
  }
});

// POST /api/users/avatar - Upload avatar (base64)
router.post("/avatar", async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body;
    if (!image) {
      res.status(400).json({ error: t(requestLang(req), "请选择图片", "Choose an image") });
      return;
    }

    const result = await uploadAvatar(req.user!.userId, image, requestLang(req));
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ user: result.user, avatarUrl: result.avatarUrl });
  } catch (error) {
    console.error("Upload avatar error:", error);
    res.status(500).json({ error: t(requestLang(req), "上传头像失败", "Failed to upload avatar") });
  }
});

// GET /api/users/me/apikey - Get API key (masked)
router.get("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const result = await getApiKey(req.user!.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "获取API Key失败", "Failed to get API Key") });
  }
});

// GET /api/users/me/apikey/history - List saved AI service configurations
router.get("/me/apikey/history", async (req: AuthRequest, res: Response) => {
  try {
    const histories = await listApiKeyHistories(req.user!.userId);
    res.json({ histories });
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "获取历史配置失败", "Failed to get saved configurations") });
  }
});

// POST /api/users/me/apikey/history/:id/apply - Apply a saved AI service configuration
router.post("/me/apikey/history/:id/apply", async (req: AuthRequest, res: Response) => {
  try {
    const result = await applyApiKeyHistory(req.user!.userId, String(req.params.id));
    if (!result) {
      res.status(404).json({ error: t(requestLang(req), "历史配置不存在", "Saved configuration not found") });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "切换历史配置失败", "Failed to apply saved configuration") });
  }
});

// DELETE /api/users/me/apikey/history/:id - Delete a saved AI service configuration
router.delete("/me/apikey/history/:id", async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await deleteApiKeyHistory(req.user!.userId, String(req.params.id));
    if (!deleted) {
      res.status(404).json({ error: t(requestLang(req), "历史配置不存在", "Saved configuration not found") });
      return;
    }
    const histories = await listApiKeyHistories(req.user!.userId);
    res.json({ success: true, histories });
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "删除历史配置失败", "Failed to delete saved configuration") });
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

    if (!ensureSafeBaseUrl(baseUrl, res, requestLang(req))) return;

    const models = await fetchModels(baseUrl, apiKey);
    res.json({ models });
  } catch (error) {
    console.error("Fetch models error:", error);
    res.status(502).json({ error: t(requestLang(req), "获取模型列表失败", "Failed to fetch model list") });
  }
});

// POST /api/users/me/apikey/test - Test OpenAI-compatible chat completions connectivity
router.post("/me/apikey/test", async (req: AuthRequest, res: Response) => {
  try {
    const current = await getApiKey(req.user!.userId);
    const baseUrl = typeof req.body.baseUrl === "string" && req.body.baseUrl.trim()
      ? req.body.baseUrl.trim()
      : current.baseUrl;
    const apiKey = typeof req.body.apiKey === "string" && req.body.apiKey.trim()
      ? req.body.apiKey.trim()
      : await getApiKeySecret(req.user!.userId);
    const model = typeof req.body.model === "string" && req.body.model.trim()
      ? req.body.model.trim()
      : current.model;
    const prompt = typeof req.body.prompt === "string" && req.body.prompt.trim()
      ? req.body.prompt.trim()
      : "你好！";

    if (!ensureSafeBaseUrl(baseUrl, res, requestLang(req))) return;

    const result = await testChatModel({ baseUrl, apiKey, model, prompt });
    res.json({ success: true, reply: result.reply, model: result.model, prompt });
  } catch (error) {
    console.error("Test chat model error:", error);
    res.status(502).json({ error: connectivityErrorMessage(error, requestLang(req)) });
  }
});

// GET /api/users/me/embedding - Get vector model configuration
router.get("/me/embedding", async (req: AuthRequest, res: Response) => {
  try {
    const result = await getEmbeddingConfig(req.user!.userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "获取向量模型配置失败", "Failed to get vector model configuration") });
  }
});

// PUT /api/users/me/embedding - Save vector model configuration
router.put("/me/embedding", async (req: AuthRequest, res: Response) => {
  try {
    const current = await getEmbeddingConfig(req.user!.userId);
    const { apiKey, baseUrl, model } = req.body;
    const nextBaseUrl = typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : current.baseUrl;
    const nextModel = typeof model === "string" && model.trim() ? model.trim() : current.model;

    if (!ensureSafeBaseUrl(nextBaseUrl, res, requestLang(req))) return;

    await saveEmbeddingConfig(req.user!.userId, {
      ...(apiKey !== undefined && { apiKey: apiKey || "" }),
      baseUrl: nextBaseUrl,
      model: nextModel,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "保存向量模型配置失败", "Failed to save vector model configuration") });
  }
});

// PUT /api/users/me/apikey - Save API key
router.put("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    const current = await getApiKey(req.user!.userId);
    const nextBaseUrl = typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : current.baseUrl;
    const nextModel = typeof model === "string" && model.trim() ? model.trim() : current.model;

    if (!ensureSafeBaseUrl(nextBaseUrl, res, requestLang(req))) return;

    await saveApiKey(req.user!.userId, {
      ...((!current.hasKey || apiKey !== undefined) && { apiKey: apiKey || "" }),
      baseUrl: nextBaseUrl,
      model: nextModel,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: t(requestLang(req), "保存API Key失败", "Failed to save API Key") });
  }
});

export default router;
