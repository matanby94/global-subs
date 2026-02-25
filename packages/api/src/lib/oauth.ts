import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { AppError } from './app-error';

// ── Google ────────────────────────────────────────────────

const googleClient = new OAuth2Client();

export interface OAuthUserInfo {
  provider: 'google' | 'apple';
  providerId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Verify a Google ID token (obtained from Google Sign-In on the client).
 * Returns the extracted user info.
 */
export async function verifyGoogleToken(idToken: string): Promise<OAuthUserInfo> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw AppError.internal('GOOGLE_OAUTH_CLIENT_ID not configured');
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw AppError.unauthorized('Invalid Google token payload', 'OAUTH_INVALID_TOKEN');
    }

    return {
      provider: 'google',
      providerId: payload.sub,
      email: payload.email ?? null,
      name: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired Google token', 'OAUTH_INVALID_TOKEN');
  }
}

// ── Apple ─────────────────────────────────────────────────

const APPLE_JWKS_URL = new URL('https://appleid.apple.com/auth/keys');
const appleJWKS = createRemoteJWKSet(APPLE_JWKS_URL);

interface AppleTokenPayload {
  sub: string;
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
}

/**
 * Verify an Apple ID token (obtained from Sign in with Apple on the client).
 * Apple tokens are JWTs signed with Apple's published JWKS.
 *
 * The optional `name` is only provided by Apple on the FIRST sign-in,
 * so the client should pass it separately.
 */
export async function verifyAppleToken(
  idToken: string,
  clientProvidedName?: string | null
): Promise<OAuthUserInfo> {
  const clientId = process.env.APPLE_CLIENT_ID; // e.g. 'com.globalsubs.web'
  if (!clientId) {
    throw AppError.internal('APPLE_CLIENT_ID not configured');
  }

  try {
    const { payload } = await jwtVerify(idToken, appleJWKS, {
      issuer: 'https://appleid.apple.com',
      audience: clientId,
    });

    const applePayload = payload as unknown as AppleTokenPayload;
    if (!applePayload.sub) {
      throw AppError.unauthorized('Invalid Apple token payload', 'OAUTH_INVALID_TOKEN');
    }

    return {
      provider: 'apple',
      providerId: applePayload.sub,
      email: applePayload.email ?? null,
      name: clientProvidedName ?? null,
      avatarUrl: null, // Apple doesn't provide avatars
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw AppError.unauthorized('Invalid or expired Apple token', 'OAUTH_INVALID_TOKEN');
  }
}
