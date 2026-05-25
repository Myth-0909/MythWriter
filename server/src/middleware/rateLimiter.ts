import { Response, NextFunction } from "express";
import { redis } from "../lib/redis";
import { AuthRequest } from "./auth";

/**
 * Sliding-window rate limiter backed by Redis.
 * Keyed by userId (requires authMiddleware to run first).
 */

interface RateLimitOptions {
  windowSeconds: number; // sliding window duration
  maxRequests: number; // max allowed requests in the window
  prefix: string; // Redis key prefix to namespace different limits
}

const RATE_LIMIT_HEADERS = {
  LIMIT: "X-RateLimit-Limit",
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  RETRY_AFTER: "Retry-After",
} as const;

export function rateLimiter(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, prefix } = options;

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    if (!userId) {
      next();
      return;
    }

    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const key = `ratelimit:${prefix}:${userId}`;

    try {
      // Remove entries outside the current window
      const cutoff = now - windowMs;
      await redis.zremrangebyscore(key, 0, cutoff);

      // Count current entries
      const count = await redis.zcard(key);

      res.setHeader(RATE_LIMIT_HEADERS.LIMIT, maxRequests);
      res.setHeader(RATE_LIMIT_HEADERS.REMAINING, Math.max(0, maxRequests - count - 1));
      res.setHeader(RATE_LIMIT_HEADERS.RESET, Math.ceil((now + windowMs) / 1000));

      if (count >= maxRequests) {
        const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
        const retryAfter = oldest.length > 0
          ? Math.ceil((parseInt(oldest[1]) + windowMs - now) / 1000)
          : windowSeconds;

        res.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, retryAfter);
        res.status(429).json({
          error: "请求过于频繁，请稍后再试",
          errorEn: "Too many requests. Please try again later.",
          retryAfter,
        });
        return;
      }

      // Add current request timestamp to the sorted set
      // Use a unique member (timestamp + random) to allow concurrent requests
      await redis.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
      await redis.expire(key, windowSeconds + 1);

      next();
    } catch {
      // Redis unavailable — allow the request through
      next();
    }
  };
}

// Pre-configured limiters
export const aiChatLimiter = rateLimiter({
  windowSeconds: 60,
  maxRequests: 30,
  prefix: "ai-chat",
});
