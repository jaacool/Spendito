// File: backend/src/config.ts
/**
 * Central backend configuration (read once from environment variables).
 *
 * ALLOWED_ORIGINS: comma separated list of frontend origins that may call
 * this API (CORS) and that may receive the PayPal OAuth result via
 * window.postMessage. Example:
 *   ALLOWED_ORIGINS=https://spendito.vercel.app,http://localhost:8081
 * If it is empty, all cross-origin browser requests are rejected (fail closed).
 */

function parseOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const origins: string[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      // Normalise to a bare origin (scheme://host[:port]) - paths are ignored
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      origins.push(url.origin);
    } catch {
      console.warn(`[Config] Ignoring invalid entry in ALLOWED_ORIGINS: "${trimmed}"`);
    }
  }
  return Array.from(new Set(origins));
}

export const ALLOWED_ORIGINS: string[] = parseOrigins(process.env.ALLOWED_ORIGINS);

export function isAllowedOrigin(origin: string | undefined | null): origin is string {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

export const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
export const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

// Public URL of this backend (needed for the PayPal OAuth redirect URI)
export const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${process.env.PORT || 3001}`;
