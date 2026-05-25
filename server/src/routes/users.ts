import { Router, Response } from "express";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { t } from "../lib/i18n";

const router = Router();
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

router.use(authMiddleware);

// GET /api/users/me - Get current user profile
router.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
        _count: {
          select: { documents: true },
        },
      },
    });

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
    const { name, password, newPassword, lang } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      res.status(404).json({ error: "用户不存在" });
      return;
    }

    if (newPassword) {
      if (!password) {
        res.status(400).json({ error: "请输入当前密码" });
        return;
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        res.status(401).json({ error: "当前密码错误" });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({ error: "新密码至少6位" });
        return;
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(lang !== undefined && { lang }),
        ...(newPassword && { password: await bcrypt.hash(newPassword, 10) }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
      },
    });

    res.json({ user: updated });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "更新用户信息失败" });
  }
});

// POST /api/users/avatar - Upload avatar (base64)
router.post("/avatar", async (req: AuthRequest, res: Response) => {
  try {
    const { image } = req.body; // base64 encoded image (data:image/png;base64,...)

    if (!image) {
      res.status(400).json({ error: "请选择图片" });
      return;
    }

    // Ensure uploads directory exists
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Extract base64 data
    const matches = image.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) {
      res.status(400).json({ error: "图片格式不正确" });
      return;
    }

    const ext = matches[1] === "png" ? "png" : "jpg";
    const data = matches[2];
    const filename = `avatar-${req.user!.userId}-${Date.now()}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    // Delete old avatar if exists
    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { avatar: true },
    });
    if (currentUser?.avatar) {
      const oldPath = path.join(UPLOADS_DIR, currentUser.avatar);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // Write file
    fs.writeFileSync(filepath, Buffer.from(data, "base64"));

    // Update user
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatar: filename },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        createdAt: true,
      },
    });

    res.json({
      user,
      avatarUrl: `/uploads/${filename}`,
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    res.status(500).json({ error: "上传头像失败" });
  }
});

async function getUserLang(req: AuthRequest): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { lang: true },
  });
  return user?.lang || "zh";
}

// GET /api/users/me/apikey - Get API key (masked)
router.get("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const lang = await getUserLang(req);
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { apiKey: true },
    });
    const key = user?.apiKey || "";
    const masked = key
      ? key.slice(0, 3) + "****" + key.slice(-4)
      : "";
    res.json({ hasKey: !!key, masked });
  } catch (error) {
    const lang = "zh";
    res.status(500).json({ error: t(lang, "获取API Key失败", "Failed to get API Key") });
  }
});

// PUT /api/users/me/apikey - Save API key
router.put("/me/apikey", async (req: AuthRequest, res: Response) => {
  try {
    const lang = await getUserLang(req);
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
      res.status(400).json({ error: t(lang, "API Key不能为空", "API Key is required") });
      return;
    }
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { apiKey: apiKey.trim() },
    });
    res.json({ success: true });
  } catch (error) {
    const lang = "zh";
    res.status(500).json({ error: t(lang, "保存API Key失败", "Failed to save API Key") });
  }
});

export default router;
