import { Router, Response } from "express";
import { redis, redisAvailable } from "../lib/redis";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import prisma from "../lib/prisma";
import { t } from "../lib/i18n";

const router = Router();

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

// POST /api/session/logout — blacklist the current JWT token
router.post("/logout", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const token = req.token;
    if (!token || !req.user) {
      res.status(400).json({ error: t(requestLang(req), "无效的登录信息", "Invalid session") });
      return;
    }

    await prisma.user.update({
      where: { id: req.user.userId },
      data: { sessionVersion: { increment: 1 } },
    });

    // Decode to get expiry without verifying (we already verified in middleware)
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      const exp = payload.exp;
      const ttl = exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 604800; // default 7d

      try {
        if (!redisAvailable) throw new Error("REDIS_UNAVAILABLE");
        await redis.setex(`blacklist:token:${token}`, ttl, "1");
      } catch {
        // Redis unavailable — logout still succeeds, just without blacklisting
      }
    }

    res.json({ success: true, message: t(requestLang(req), "已退出登录", "Signed out") });
  } catch {
    res.status(500).json({ error: t(requestLang(req), "退出失败", "Sign out failed") });
  }
});

export default router;
