import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { redis, redisAvailable } from "../lib/redis";
import { DEFAULT_JWT_SECRET } from "../lib/runtimeConfig";
import prisma from "../lib/prisma";
import { t } from "../lib/i18n";

export function resolveJwtSecret(secret?: string, nodeEnv = process.env.NODE_ENV): string {
  const resolvedSecret = arguments.length === 0 ? process.env.JWT_SECRET : secret;
  const trimmed = resolvedSecret?.trim();
  if (trimmed) return trimmed;
  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET must be configured in production");
  }
  return DEFAULT_JWT_SECRET;
}

const JWT_SECRET = resolveJwtSecret();

export interface AuthPayload {
  userId: string;
  email: string;
  sessionVersion: number;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  token?: string;
}

function requestLang(req: Request) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: t(requestLang(req), "未登录，请先登录", "Sign in to continue") });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { sessionVersion: true },
    });
    if (!user || user.sessionVersion !== decoded.sessionVersion) {
      res.status(401).json({
        error: t(requestLang(req), "登录已过期，请重新登录", "Your session expired. Sign in again"),
      });
      return;
    }

    try {
      if (!redisAvailable) throw new Error("REDIS_UNAVAILABLE");
      const blacklisted = await redis.get(`blacklist:token:${token}`);
      if (blacklisted) {
        res.status(401).json({
          error: t(requestLang(req), "登录已过期，请重新登录", "Your session expired. Sign in again"),
        });
        return;
      }
    } catch {
      // The database-backed session version still enforces logout when Redis is unavailable.
    }
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    res.status(401).json({
      error: t(requestLang(req), "登录已过期，请重新登录", "Your session expired. Sign in again"),
    });
  }
}

// authMiddleware with Redis blacklist check
export async function authMiddlewareWithBlacklist(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authMiddleware(req, res, next);
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
