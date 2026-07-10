import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { redis } from "../lib/redis";
import { DEFAULT_JWT_SECRET } from "../lib/runtimeConfig";

export function resolveJwtSecret(secret = process.env.JWT_SECRET, nodeEnv = process.env.NODE_ENV): string {
  const trimmed = secret?.trim();
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
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
  token?: string;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "未登录，请先登录" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

// authMiddleware with Redis blacklist check
export async function authMiddlewareWithBlacklist(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "未登录，请先登录" });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;

    // Check token blacklist
    try {
      const blacklisted = await redis.get(`blacklist:token:${token}`);
      if (blacklisted) {
        res.status(401).json({ error: "令牌已失效，请重新登录" });
        return;
      }
    } catch {
      // Redis unavailable — allow through
    }

    req.user = decoded;
    req.token = token;
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
