/**
 * Process-local sliding-window rate limiter used as a fallback when Redis is
 * unavailable. This keeps AI/billing endpoints protected (fail-closed) instead
 * of allowing unlimited traffic when the shared limiter backend is down.
 *
 * Note: this is per-process only. In a multi-instance deployment the effective
 * limit is `maxRequests * instances` while Redis is down — still bounded, which
 * is the property we care about for cost abuse.
 */

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetSeconds: number;
};

export class InMemorySlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  check(key: string, now: number, windowMs: number, maxRequests: number): RateLimitDecision {
    this.maybeSweep(now, windowMs);
    const cutoff = now - windowMs;
    const timestamps = (this.hits.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.hits.set(key, timestamps);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        resetSeconds: Math.ceil((now + windowMs) / 1000),
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - timestamps.length),
      retryAfterSeconds: 0,
      resetSeconds: Math.ceil((now + windowMs) / 1000),
    };
  }

  /** Periodically drop empty/expired buckets so the map does not grow forever. */
  private maybeSweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    const cutoff = now - windowMs;
    for (const [key, timestamps] of this.hits) {
      const live = timestamps.filter((ts) => ts > cutoff);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }

  reset(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }
}
