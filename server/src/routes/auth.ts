import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "../lib/prisma";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth";
import { verifyPassword } from "../services/authService";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ error: "姓名、邮箱和密码不能为空" });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: "密码至少6位" });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "该邮箱已被注册" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const token = generateToken({ userId: user.id, email: user.email });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "注册失败，请稍后重试" });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "邮箱和密码不能为空" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "该邮箱尚未注册", code: "NOT_REGISTERED" });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: "密码错误，请重试", code: "WRONG_PASSWORD" });
      return;
    }

    const token = generateToken({ userId: user.id, email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "登录失败，请稍后重试" });
  }
});

// POST /api/auth/forgot-password - Send reset code
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: "请输入邮箱地址" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "该邮箱尚未注册", code: "NOT_REGISTERED" });
      return;
    }

    // Generate 6-digit code, expires in 10 minutes
    const code = crypto.randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: code,
        resetTokenExpires: expires,
      },
    });

    // In production, send code via email. For development, return it in response.
    res.json({
      message: "重置验证码已生成",
      code, // TODO: 生产环境通过邮件发送，此处仅开发调试用
      expiresIn: "10分钟",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "操作失败，请稍后重试" });
  }
});

// POST /api/auth/reset-password - Reset password with code
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      res.status(400).json({ error: "邮箱、验证码和新密码不能为空" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "新密码至少6位" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "该邮箱尚未注册" });
      return;
    }

    if (!user.resetToken || !user.resetTokenExpires) {
      res.status(400).json({ error: "请先获取验证码" });
      return;
    }

    if (new Date() > user.resetTokenExpires) {
      res.status(400).json({ error: "验证码已过期，请重新获取" });
      return;
    }

    if (user.resetToken !== code) {
      res.status(400).json({ error: "验证码错误" });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({ message: "密码重置成功，请重新登录" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "重置失败，请稍后重试" });
  }
});

// POST /api/auth/verify-password - Verify current password (requires auth)
router.post("/verify-password", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: "请输入密码" });
      return;
    }

    const valid = await verifyPassword(req.user!.userId, password);
    if (!valid) {
      res.status(401).json({ error: "密码错误" });
      return;
    }

    res.json({ verified: true });
  } catch (error) {
    console.error("Verify password error:", error);
    res.status(500).json({ error: "验证失败" });
  }
});

export default router;
