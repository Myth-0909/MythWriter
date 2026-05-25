import { Router, Response } from "express";
import { redis } from "../lib/redis";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();

// POST /api/session/logout — blacklist the current JWT token
router.post("/logout", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(400).json({ error: "无效的令牌" });
      return;
    }

    const token = authHeader.split(" ")[1];

    // Decode to get expiry without verifying (we already verified in middleware)
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const exp = payload.exp;
      const ttl = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 604800; // default 7d

      try {
        await redis.setex(`blacklist:token:${token}`, ttl, "1");
      } catch {
        // Redis unavailable — logout still succeeds, just without blacklisting
      }
    }

    res.json({ success: true, message: "已退出登录" });
  } catch {
    res.status(500).json({ error: "退出失败" });
  }
});

export default router;
