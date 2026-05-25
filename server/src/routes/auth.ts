import { Router, Request, Response } from "express";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth";
import { generateResetCode, loginUser, registerUser, resetPassword, verifyPassword } from "../services/authService";

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

    const result = await registerUser(name, email, password);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const token = generateToken({ userId: result.user.id, email: result.user.email });

    res.status(201).json({ token, user: result.user });
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

    const result = await loginUser(email, password);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, code: result.code });
      return;
    }

    const token = generateToken({ userId: result.user.id, email: result.user.email });

    res.json({ token, user: result.user });
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

    const result = await generateResetCode(email);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, code: result.code });
      return;
    }

    res.json({
      message: "重置验证码已生成",
      code: result.code,
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

    const result = await resetPassword(email, code, newPassword);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

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
