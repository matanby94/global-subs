/**
 * Thin wrapper around Umami's `window.umami.track()`.
 * Guards against SSR and missing Umami (dev without Umami configured).
 * All calls are fire-and-forget — analytics should never break the app.
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, data?: Record<string, string | number | boolean>) => void;
    };
  }
}

export function trackEvent(
  eventName: string,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return;
  if (!window.umami) return;
  try {
    window.umami.track(eventName, data);
  } catch {
    // Never throw from analytics
  }
}
