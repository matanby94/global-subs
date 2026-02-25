import crypto from 'node:crypto';

/**
 * Timing-safe string comparison to prevent timing attacks on token verification.
 * Uses constant-time comparison even on length mismatch.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against self to maintain constant-time even on length mismatch.
    // This prevents leaking the length of the expected token.
    const buf = Buffer.from(a);
    crypto.timingSafeEqual(buf, buf);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
