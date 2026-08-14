import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

export let redisAvailable = false;
let unavailableWarningShown = false;

redis.on("error", (err) => {
  redisAvailable = false;
  if (!unavailableWarningShown) {
    unavailableWarningShown = true;
    console.warn("[Redis] unavailable; using in-memory fallbacks:", err.message);
  }
});

redis.on("connect", () => {
  redisAvailable = true;
  unavailableWarningShown = false;
  console.log("[Redis] connected");
});

// Call this during app startup
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err: any) {
    redisAvailable = false;
    if (!unavailableWarningShown) {
      unavailableWarningShown = true;
      console.warn("[Redis] unavailable; using in-memory fallbacks:", err.message);
    }
  }
}
