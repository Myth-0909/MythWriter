import { Router, Request, Response } from "express";
import { generateToken, authMiddleware, AuthRequest } from "../middleware/auth";
import { checkEmailExists, generateResetCode, loginUser, registerUser, resetPassword, verifyPassword } from "../services/authService";
import { t } from "../lib/i18n";

const router = Router();

function requestLang(req: Request) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    const lang = requestLang(req);

    if (!name || !email || !password) {
      res.status(400).json({ error: t(lang, "姓名、邮箱和密码不能为空", "Name, email, and password are required") });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: t(lang, "密码至少6位", "Password must be at least 6 characters") });
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
    res.status(500).json({ error: t(requestLang(req), "注册失败，请稍后重试", "Registration failed. Please try again later") });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const lang = requestLang(req);

    if (!email || !password) {
      res.status(400).json({ error: t(lang, "邮箱和密码不能为空", "Email and password are required") });
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
    res.status(500).json({ error: t(requestLang(req), "登录失败，请稍后重试", "Login failed. Please try again later") });
  }
});

// POST /api/auth/check-email - Verify email is registered
router.post("/check-email", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const lang = requestLang(req);

    if (!email) {
      res.status(400).json({ error: t(lang, "请输入邮箱地址", "Please enter an email address") });
      return;
    }

    const exists = await checkEmailExists(email);
    res.json({ exists });
  } catch (error) {
    console.error("Check email error:", error);
    res.status(500).json({ error: t(requestLang(req), "操作失败，请稍后重试", "Operation failed. Please try again later") });
  }
});

// POST /api/auth/forgot-password - Send reset code
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const lang = requestLang(req);

    if (!email) {
      res.status(400).json({ error: t(lang, "请输入邮箱地址", "Please enter an email address") });
      return;
    }

    const result = await generateResetCode(email);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error, code: result.code });
      return;
    }

    res.json({
      message: t(lang, "重置验证码已生成", "Reset code generated"),
      code: result.code,
      expiresIn: t(lang, "10分钟", "10 minutes"),
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: t(requestLang(req), "操作失败，请稍后重试", "Operation failed. Please try again later") });
  }
});

// POST /api/auth/reset-password - Reset password with code
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body;
    const lang = requestLang(req);

    if (!email || !code || !newPassword) {
      res.status(400).json({ error: t(lang, "邮箱、验证码和新密码不能为空", "Email, verification code, and new password are required") });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: t(lang, "新密码至少6位", "New password must be at least 6 characters") });
      return;
    }

    const result = await resetPassword(email, code, newPassword);
    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ message: t(lang, "密码重置成功，请重新登录", "Password reset succeeded. Please log in again") });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: t(requestLang(req), "重置失败，请稍后重试", "Reset failed. Please try again later") });
  }
});

// POST /api/auth/verify-password - Verify current password (requires auth)
router.post("/verify-password", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    const lang = requestLang(req);
    if (!password) {
      res.status(400).json({ error: t(lang, "请输入密码", "Please enter your password") });
      return;
    }

    const valid = await verifyPassword(req.user!.userId, password);
    if (!valid) {
      res.status(401).json({ error: t(lang, "密码错误", "Incorrect password") });
      return;
    }

    res.json({ verified: true });
  } catch (error) {
    console.error("Verify password error:", error);
    res.status(500).json({ error: t(requestLang(req), "验证失败", "Verification failed") });
  }
});

export default router;
