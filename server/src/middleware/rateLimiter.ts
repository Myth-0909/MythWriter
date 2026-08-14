import { Response, NextFunction } from "express";
import { redis, redisAvailable } from "../lib/redis";
import { AuthRequest } from "./auth";
import { InMemorySlidingWindowLimiter } from "../lib/inMemoryRateLimiter";
import { t } from "../lib/i18n";

// Shared per-process fallback used when Redis is unavailable so limits still
// apply (fail-closed) instead of allowing unbounded traffic.
const memoryLimiter = new InMemorySlidingWindowLimiter();

/**
 * Sliding-window rate limiter backed by Redis.
 * Keyed by userId (requires authMiddleware to run first).
 */

interface RateLimitOptions {
  windowSeconds: number; // sliding window duration
  maxRequests: number; // max allowed requests in the window
  prefix: string; // Redis key prefix to namespace different limits
  // Resolves the rate-limit identity from the request. Defaults to the
  // authenticated userId. Return null to skip limiting for this request.
  keyResolver?: (req: AuthRequest) => string | null | undefined;
}

const RATE_LIMIT_HEADERS = {
  LIMIT: "X-RateLimit-Limit",
  REMAINING: "X-RateLimit-Remaining",
  RESET: "X-RateLimit-Reset",
  RETRY_AFTER: "Retry-After",
} as const;

function clientIp(req: AuthRequest): string {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function requestLang(req: AuthRequest) {
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

export function rateLimiter(options: RateLimitOptions) {
  const { windowSeconds, maxRequests, prefix } = options;
  const resolveKey = options.keyResolver || ((req: AuthRequest) => req.user?.userId);

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const identity = resolveKey(req);
    if (!identity) {
      next();
      return;
    }

    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const key = `ratelimit:${prefix}:${identity}`;

    try {
      if (!redisAvailable) throw new Error("REDIS_UNAVAILABLE");
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
          error: t(requestLang(req), "请求过于频繁，请稍后再试", "Too many requests. Please try again later."),
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
      // Redis unavailable — fall back to a process-local limiter so we stay
      // fail-closed (bounded traffic) rather than allowing everything through.
      const decision = memoryLimiter.check(key, now, windowMs, maxRequests);
      res.setHeader(RATE_LIMIT_HEADERS.LIMIT, maxRequests);
      res.setHeader(RATE_LIMIT_HEADERS.REMAINING, decision.remaining);
      res.setHeader(RATE_LIMIT_HEADERS.RESET, decision.resetSeconds);
      if (!decision.allowed) {
        res.setHeader(RATE_LIMIT_HEADERS.RETRY_AFTER, decision.retryAfterSeconds);
        res.status(429).json({
          error: t(requestLang(req), "请求过于频繁，请稍后再试", "Too many requests. Please try again later."),
          retryAfter: decision.retryAfterSeconds,
        });
        return;
      }
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

// IP-based limiter for unauthenticated auth endpoints (brute-force protection).
export const authLimiter = rateLimiter({
  windowSeconds: 60,
  maxRequests: 10,
  prefix: "auth",
  keyResolver: (req) => clientIp(req),
});
