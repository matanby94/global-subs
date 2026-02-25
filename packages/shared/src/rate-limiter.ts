import type Redis from 'ioredis';

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Stores a sorted set per provider where each member is a request timestamp.
 * `acquireSlot()` atomically checks the window and adds a new entry if allowed.
 *
 * This is shared across all processes (API, scrapers, workers) that connect to the
 * same Redis instance, giving a single global view of per-provider request rates.
 */

export interface ProviderRateLimitConfig {
  /** Maximum requests allowed within the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface AcquireResult {
  allowed: boolean;
  /** When denied, how many ms to wait before retrying. 0 when allowed. */
  retryAfterMs: number;
  /** Current count of requests in the window (including this one if allowed). */
  currentCount: number;
}

// Lua script: atomically check window count and add a new entry if under the limit.
// KEYS[1] = rate limit sorted set key
// ARGV[1] = window start timestamp (ms)
// ARGV[2] = current timestamp (ms)
// ARGV[3] = max requests allowed in window
// ARGV[4] = TTL in seconds for the key
// ARGV[5] = unique member id (timestamp + random suffix for uniqueness)
//
// Returns: [allowed (0|1), currentCount, oldestTs]
const ACQUIRE_SCRIPT = `
local key = KEYS[1]
local windowStart = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local maxReqs = tonumber(ARGV[3])
local ttlSec = tonumber(ARGV[4])
local memberId = ARGV[5]

-- Remove expired entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count current entries in window
local count = redis.call('ZCARD', key)

if count >= maxReqs then
  -- Denied: find oldest entry to compute retry-after
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldestTs = 0
  if #oldest >= 2 then
    oldestTs = tonumber(oldest[2])
  end
  return {0, count, oldestTs}
end

-- Allowed: add this request
redis.call('ZADD', key, now, memberId)
redis.call('EXPIRE', key, ttlSec)

return {1, count + 1, 0}
`;

let acquireScriptSha: string | null = null;

/** Default rate limits per provider. */
export const DEFAULT_PROVIDER_LIMITS: Record<string, ProviderRateLimitConfig> = {
  opensubtitles_org: { maxRequests: 1, windowMs: 3_000 },
  subdl: { maxRequests: 5, windowMs: 1_000 },
  moviesubtitles: { maxRequests: 1, windowMs: 1_000 },
  opensubtitles: { maxRequests: 5, windowMs: 86_400_000 }, // daily download quota
};

function redisKey(provider: string): string {
  return `ratelimit:provider:${provider}`;
}

let counter = 0;

/**
 * Try to acquire a rate-limit slot for a provider.
 * Uses a Redis Lua script for atomicity.
 */
export async function acquireProviderSlot(
  redis: Redis,
  provider: string,
  config?: Partial<ProviderRateLimitConfig>
): Promise<AcquireResult> {
  const defaults = DEFAULT_PROVIDER_LIMITS[provider] || { maxRequests: 10, windowMs: 1_000 };
  const maxRequests = config?.maxRequests ?? defaults.maxRequests;
  const windowMs = config?.windowMs ?? defaults.windowMs;

  const now = Date.now();
  const windowStart = now - windowMs;
  const ttlSec = Math.max(1, Math.ceil(windowMs / 1000) + 1);
  const memberId = `${now}:${process.pid}:${++counter}`;

  // Load the script on first use (EVALSHA for performance)
  if (!acquireScriptSha) {
    acquireScriptSha = (await redis.script('LOAD', ACQUIRE_SCRIPT)) as string;
  }

  let result: [number, number, number];
  try {
    result = (await redis.evalsha(
      acquireScriptSha,
      1,
      redisKey(provider),
      String(windowStart),
      String(now),
      String(maxRequests),
      String(ttlSec),
      memberId
    )) as [number, number, number];
  } catch (err: unknown) {
    // Script might have been evicted (NOSCRIPT); reload and retry
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('NOSCRIPT')) {
      acquireScriptSha = (await redis.script('LOAD', ACQUIRE_SCRIPT)) as string;
      result = (await redis.evalsha(
        acquireScriptSha,
        1,
        redisKey(provider),
        String(windowStart),
        String(now),
        String(maxRequests),
        String(ttlSec),
        memberId
      )) as [number, number, number];
    } else {
      throw err;
    }
  }

  const [allowed, currentCount, oldestTs] = result;

  if (allowed) {
    return { allowed: true, retryAfterMs: 0, currentCount };
  }

  // Compute retry-after: time until the oldest entry expires out of the window
  const retryAfterMs = oldestTs > 0 ? Math.max(100, oldestTs + windowMs - now) : windowMs;

  return { allowed: false, retryAfterMs, currentCount };
}

/**
 * Report a 429 / rate-limit response from a provider.
 * Sets a Redis key that blocks all requests to this provider until the backoff expires.
 * Other processes reading this key will skip the provider.
 */
export async function reportProviderBlock(
  redis: Redis,
  provider: string,
  blockMs: number
): Promise<void> {
  const key = `ratelimit:blocked:${provider}`;
  const unblockedAt = Date.now() + blockMs;
  await redis.set(key, String(unblockedAt), 'PX', blockMs);
}

/**
 * Check if a provider is currently blocked (e.g. from a 429 backoff).
 * Returns 0 if not blocked, or the number of ms remaining in the block.
 */
export async function getProviderBlockMs(redis: Redis, provider: string): Promise<number> {
  const key = `ratelimit:blocked:${provider}`;
  const val = await redis.get(key);
  if (!val) return 0;
  const unblockedAt = parseInt(val, 10);
  const remaining = unblockedAt - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Custom error that tells BullMQ to delay the retry by a specific amount.
 */
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly provider: string;

  constructor(provider: string, retryAfterMs: number) {
    super(`Rate limited by ${provider}, retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
    this.provider = provider;
    this.retryAfterMs = retryAfterMs;
  }
}
