import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:3011';
  let apiOrigin = 'http://localhost:3011';
  try {
    apiOrigin = new URL(apiUrl).origin;
  } catch {
    // fall back to the default origin
  }

  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Allow Google Sign-In popup to communicate back via postMessage
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  // Content Security Policy — only set in production; dev needs 'unsafe-eval' for
  // Next.js hot-reload which Lighthouse penalises, so skip it entirely during dev.
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; frame-src https://accounts.google.com; connect-src 'self' ${apiOrigin} https://accounts.google.com`
    );
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
