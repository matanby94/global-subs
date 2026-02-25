import { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from '../lib/timing-safe';

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export async function authenticateInternal(request: FastifyRequest, reply: FastifyReply) {
  const expected = (process.env.INTERNAL_API_TOKEN || '').trim();

  if (!expected) {
    return reply.status(500).send({
      error: {
        code: 'CONFIG_ERROR',
        message: 'INTERNAL_API_TOKEN not configured',
        statusCode: 500,
      },
    });
  }

  // Check header
  const header = request.headers['x-internal-token'];
  const headerToken = Array.isArray(header) ? header[0] : header;

  // Check cookie (set by dashboard)
  const cookies = parseCookie(request.headers.cookie);
  const cookieToken = cookies.internal_token;

  const token = headerToken || cookieToken;
  if (!token || !timingSafeEqual(token, expected)) {
    return reply
      .status(401)
      .send({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized', statusCode: 401 } });
  }

  // CSRF protection for cookie-based auth:
  // When authenticating via cookie (not header), require that the request
  // also includes an X-Requested-With header. Browsers will not send this
  // header in cross-origin requests without a preflight, preventing CSRF.
  if (cookieToken && !headerToken) {
    const xRequestedWith = request.headers['x-requested-with'];
    if (!xRequestedWith) {
      return reply.status(403).send({
        error: {
          code: 'CSRF_REJECTED',
          message: 'Missing X-Requested-With header',
          statusCode: 403,
        },
      });
    }
  }
}
