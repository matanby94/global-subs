import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { authenticateUserOrAddonToken } from '../middleware/addon-auth';
import { ensureAddonSubtitle } from '../lib/ensure-addon';
import crypto from 'node:crypto';

const EnsureAddonSubtitleSchema = z.object({
  type: z.enum(['movie', 'series']),
  stremioId: z.string().min(1),
  dstLang: z.string().length(2).optional(),
});

const CreateAddonInstallationSchema = z.object({
  dstLang: z.string().length(2),
});

function getAddonPublicUrl(): string {
  const raw = (process.env.ADDON_PUBLIC_URL || process.env.ADDON_URL || '').trim();
  return raw.length > 0 ? raw.replace(/\/$/, '') : 'http://127.0.0.1:3012';
}

// NOTE: Core ensure logic lives in ../lib/ensure-addon so it can be reused by internal routes.

export async function addonRoutes(fastify: FastifyInstance) {
  // Creates an opaque install token so users can install a personalized addon without exposing JWTs in the URL.
  fastify.post('/installations', { preHandler: authenticateUser }, async (request, reply) => {
    const user = request.user as { userId: string };
    const body = CreateAddonInstallationSchema.parse(request.body);
    const dstLang = body.dstLang.toLowerCase();

    const existing = await fastify.db.query(
      'SELECT token FROM addon_installations WHERE user_id = $1 AND dst_lang = $2 ORDER BY created_at DESC LIMIT 1',
      [user.userId, dstLang]
    );

    const token =
      existing.rows.length > 0
        ? (existing.rows[0].token as string)
        : crypto.randomBytes(12).toString('base64url');

    if (existing.rows.length === 0) {
      await fastify.db.query(
        'INSERT INTO addon_installations (user_id, dst_lang, token) VALUES ($1, $2, $3)',
        [user.userId, dstLang, token]
      );
    }

    const addonBase = getAddonPublicUrl();
    const manifestUrl = `${addonBase}/user/${user.userId}/${token}/manifest.json`;

    let stremioInstallUrl = manifestUrl;
    try {
      const url = new URL(manifestUrl);
      stremioInstallUrl = `stremio://${url.host}${url.pathname}`;
    } catch {
      // ignore
    }

    return reply.send({ token, dstLang, manifestUrl, stremioInstallUrl });
  });

  // Called by the add-on server (authenticated with the user's JWT stored in the manifest config)
  // It ensures a subtitle exists for stremioId+dstLang (import if available, else enqueue LLM translation).
  fastify.post('/ensure', { preHandler: authenticateUserOrAddonToken }, async (request, reply) => {
    type AuthedReq = typeof request & {
      user?: { userId: string };
      addonInstallation?: { dstLang?: string };
    };

    const authed = request as unknown as AuthedReq;
    const user = authed.user as { userId: string };

    let body: z.infer<typeof EnsureAddonSubtitleSchema>;
    try {
      body = EnsureAddonSubtitleSchema.parse(request.body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid request';
      return reply.status(400).send({ error: msg, status: 'error', subtitles: [] });
    }

    const installationDstLang = authed.addonInstallation?.dstLang;
    const dstLang = (body.dstLang || installationDstLang || '').toLowerCase();
    if (!/^[a-z]{2}$/.test(dstLang)) {
      return reply.status(400).send({ error: 'dstLang required', subtitles: [] });
    }

    try {
      const result = await ensureAddonSubtitle(fastify, {
        userId: user.userId,
        type: body.type,
        stremioId: body.stremioId,
        dstLang,
      });
      return reply.status(result.code).send(result.body);
    } catch (err: unknown) {
      fastify.log.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to process addon request';
      const code = msg === 'Insufficient credits' ? 402 : 400;
      return reply.status(code).send({ error: msg, status: 'error', subtitles: [] });
    }
  });
}
