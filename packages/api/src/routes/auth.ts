import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyGoogleToken, verifyAppleToken, OAuthUserInfo } from '../lib/oauth';
import { AppError } from '../lib/app-error';

// ── Zod schemas for auth endpoints ────────────────────────

const GoogleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});

const AppleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  name: z.string().optional().nullable(),
});

// Default token lifetime: 7 days
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
// Refresh tokens: 30 days
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// ── Helpers ───────────────────────────────────────────────

/**
 * Upsert a user from OAuth provider info.
 * - If user exists by (auth_provider, auth_provider_id) → return existing user
 * - If user exists by email but different provider → link the OAuth provider
 * - Otherwise → create new user with wallet + free trial credits
 */
async function upsertOAuthUser(
  fastify: FastifyInstance,
  info: OAuthUserInfo
): Promise<{ id: string; email: string; name: string | null; isNew: boolean }> {
  const client = await fastify.db.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if user already exists by provider + providerId
    const existingByProvider = await client.query(
      `SELECT id, email, name FROM users WHERE auth_provider = $1 AND auth_provider_id = $2`,
      [info.provider, info.providerId]
    );

    if (existingByProvider.rows.length > 0) {
      // Update avatar + name if changed
      await client.query(
        `UPDATE users SET avatar_url = COALESCE($1, avatar_url), name = COALESCE($2, name), updated_at = NOW() WHERE id = $3`,
        [info.avatarUrl, info.name, existingByProvider.rows[0].id]
      );
      await client.query('COMMIT');
      return { ...existingByProvider.rows[0], isNew: false };
    }

    // 2. Check if user exists by email (link account to new provider)
    if (info.email) {
      const existingByEmail = await client.query(
        `SELECT id, email, name FROM users WHERE email = $1`,
        [info.email]
      );

      if (existingByEmail.rows.length > 0) {
        await client.query(
          `UPDATE users SET auth_provider = $1, auth_provider_id = $2, avatar_url = COALESCE($3, avatar_url), name = COALESCE($4, name), updated_at = NOW() WHERE id = $5`,
          [info.provider, info.providerId, info.avatarUrl, info.name, existingByEmail.rows[0].id]
        );
        await client.query('COMMIT');
        return { ...existingByEmail.rows[0], isNew: false };
      }
    }

    // 3. Create new user
    const userResult = await client.query(
      `INSERT INTO users (email, name, auth_provider, auth_provider_id, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name`,
      [info.email, info.name, info.provider, info.providerId, info.avatarUrl]
    );
    const user = userResult.rows[0];

    // Create wallet with 10 free trial credits
    await client.query('INSERT INTO wallets (user_id, balance_credits) VALUES ($1, $2)', [
      user.id,
      10,
    ]);

    // Log free trial credit grant
    const walletResult = await client.query('SELECT id FROM wallets WHERE user_id = $1', [user.id]);
    await client.query(
      `INSERT INTO credit_transactions (user_id, wallet_id, delta, reason, reference) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, walletResult.rows[0].id, 10, 'Free trial welcome bonus', 'signup']
    );

    await client.query('COMMIT');
    return { ...user, isNew: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function signTokens(fastify: FastifyInstance, user: { id: string; email: string }) {
  const accessToken = fastify.jwt.sign(
    { userId: user.id, email: user.email, type: 'access' },
    { expiresIn: JWT_EXPIRES_IN }
  );
  const refreshToken = fastify.jwt.sign(
    { userId: user.id, email: user.email, type: 'refresh' },
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
}

// ── Routes ────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/auth/google
   * Body: { idToken: string }
   *
   * Verifies a Google Sign-In ID token, upserts the user,
   * and returns an access + refresh JWT pair.
   */
  fastify.post('/google', async (request, reply) => {
    const body = GoogleAuthSchema.parse(request.body);
    const oauthInfo = await verifyGoogleToken(body.idToken);

    if (!oauthInfo.email) {
      throw AppError.badRequest('Google account must have an email', 'OAUTH_NO_EMAIL');
    }

    const user = await upsertOAuthUser(fastify, oauthInfo);
    const tokens = signTokens(fastify, user);

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
      isNew: user.isNew,
    });
  });

  /**
   * POST /api/auth/apple
   * Body: { idToken: string, name?: string }
   *
   * Verifies an Apple Sign-In ID token. Apple only provides the user's
   * name on the first sign-in, so the client should include it.
   */
  fastify.post('/apple', async (request, reply) => {
    const body = AppleAuthSchema.parse(request.body);
    const oauthInfo = await verifyAppleToken(body.idToken, body.name);

    const user = await upsertOAuthUser(fastify, oauthInfo);
    const tokens = signTokens(fastify, user);

    return reply.send({
      user: { id: user.id, email: user.email, name: user.name },
      ...tokens,
      isNew: user.isNew,
    });
  });

  /**
   * POST /api/auth/refresh
   * Body: { refreshToken: string }
   *
   * Exchange a valid refresh token for new access + refresh tokens.
   */
  fastify.post('/refresh', async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken?: string };
    if (!refreshToken) {
      throw AppError.badRequest('refreshToken is required', 'MISSING_REFRESH_TOKEN');
    }

    try {
      const decoded = fastify.jwt.verify<{
        userId: string;
        email: string;
        type: string;
      }>(refreshToken);

      if (decoded.type !== 'refresh') {
        throw AppError.unauthorized('Invalid token type', 'INVALID_TOKEN_TYPE');
      }

      // Verify user still exists
      const result = await fastify.db.query('SELECT id, email FROM users WHERE id = $1', [
        decoded.userId,
      ]);
      if (result.rows.length === 0) {
        throw AppError.unauthorized('User no longer exists', 'USER_NOT_FOUND');
      }

      const user = result.rows[0];
      const tokens = signTokens(fastify, user);

      return reply.send(tokens);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
  });
}
