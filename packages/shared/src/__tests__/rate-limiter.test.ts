import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Redis from 'ioredis';
import {
  acquireProviderSlot,
  reportProviderBlock,
  getProviderBlockMs,
  RateLimitError,
  DEFAULT_PROVIDER_LIMITS,
} from '../rate-limiter';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const TEST_PREFIX = 'ratelimit:provider:__test_';
const TEST_PROVIDER = '__test_provider';

let redis: Redis;

beforeAll(() => {
  redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, maxRetriesPerRequest: null });
});

afterAll(async () => {
  // Clean up test keys
  const keys = await redis.keys('ratelimit:*__test_*');
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();
});

beforeEach(async () => {
  // Clean up test provider keys before each test
  const keys = await redis.keys('ratelimit:*__test_*');
  if (keys.length > 0) await redis.del(...keys);
});

describe('acquireProviderSlot', () => {
  it('allows a request when under the limit', async () => {
    const result = await acquireProviderSlot(redis, TEST_PROVIDER, {
      maxRequests: 3,
      windowMs: 5_000,
    });
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
    expect(result.currentCount).toBe(1);
  });

  it('allows multiple requests up to the limit', async () => {
    const config = { maxRequests: 3, windowMs: 10_000 };

    const r1 = await acquireProviderSlot(redis, TEST_PROVIDER, config);
    const r2 = await acquireProviderSlot(redis, TEST_PROVIDER, config);
    const r3 = await acquireProviderSlot(redis, TEST_PROVIDER, config);

    expect(r1.allowed).toBe(true);
    expect(r1.currentCount).toBe(1);
    expect(r2.allowed).toBe(true);
    expect(r2.currentCount).toBe(2);
    expect(r3.allowed).toBe(true);
    expect(r3.currentCount).toBe(3);
  });

  it('denies requests when the limit is exceeded', async () => {
    const config = { maxRequests: 2, windowMs: 10_000 };

    await acquireProviderSlot(redis, TEST_PROVIDER, config);
    await acquireProviderSlot(redis, TEST_PROVIDER, config);
    const denied = await acquireProviderSlot(redis, TEST_PROVIDER, config);

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.currentCount).toBe(2);
  });

  it('allows requests again after the window expires', async () => {
    const config = { maxRequests: 1, windowMs: 300 }; // 300ms window

    const r1 = await acquireProviderSlot(redis, TEST_PROVIDER, config);
    expect(r1.allowed).toBe(true);

    const denied = await acquireProviderSlot(redis, TEST_PROVIDER, config);
    expect(denied.allowed).toBe(false);

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 400));

    const r2 = await acquireProviderSlot(redis, TEST_PROVIDER, config);
    expect(r2.allowed).toBe(true);
  });

  it('uses default limits for known providers', async () => {
    // subdl has 5 req/1s by default
    expect(DEFAULT_PROVIDER_LIMITS.subdl).toEqual({ maxRequests: 5, windowMs: 1_000 });
    expect(DEFAULT_PROVIDER_LIMITS.opensubtitles_org).toEqual({ maxRequests: 1, windowMs: 3_000 });
  });

  it('uses fallback limits for unknown providers', async () => {
    const unknown = '__test_unknown_provider';
    const r1 = await acquireProviderSlot(redis, unknown);
    expect(r1.allowed).toBe(true);
    // Default fallback is 10 req/1s
    expect(r1.currentCount).toBe(1);
  });

  it('isolates rate limits between different providers', async () => {
    const providerA = '__test_providerA';
    const providerB = '__test_providerB';
    const config = { maxRequests: 1, windowMs: 10_000 };

    const rA = await acquireProviderSlot(redis, providerA, config);
    const rB = await acquireProviderSlot(redis, providerB, config);

    expect(rA.allowed).toBe(true);
    expect(rB.allowed).toBe(true);

    // A is now exhausted
    const rA2 = await acquireProviderSlot(redis, providerA, config);
    expect(rA2.allowed).toBe(false);

    // B is still OK
    // (B already used 1, so with maxRequests=1 it's also exhausted — use maxRequests=2 for B)
    const rB2 = await acquireProviderSlot(redis, providerB, { maxRequests: 2, windowMs: 10_000 });
    expect(rB2.allowed).toBe(true);
  });
});

describe('reportProviderBlock / getProviderBlockMs', () => {
  it('reports a block and returns the remaining time', async () => {
    const provider = '__test_blocked';
    await reportProviderBlock(redis, provider, 2_000);

    const remaining = await getProviderBlockMs(redis, provider);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(2_000);
  });

  it('returns 0 when provider is not blocked', async () => {
    const provider = '__test_unblocked';
    const remaining = await getProviderBlockMs(redis, provider);
    expect(remaining).toBe(0);
  });

  it('returns 0 after the block expires', async () => {
    const provider = '__test_expired_block';
    await reportProviderBlock(redis, provider, 200); // 200ms block

    await new Promise((resolve) => setTimeout(resolve, 300));

    const remaining = await getProviderBlockMs(redis, provider);
    expect(remaining).toBe(0);
  });
});

describe('RateLimitError', () => {
  it('has the correct name and properties', () => {
    const err = new RateLimitError('opensubtitles_org', 5_000);
    expect(err.name).toBe('RateLimitError');
    expect(err.provider).toBe('opensubtitles_org');
    expect(err.retryAfterMs).toBe(5_000);
    expect(err.message).toContain('opensubtitles_org');
    expect(err.message).toContain('5000');
    expect(err).toBeInstanceOf(Error);
  });
});
