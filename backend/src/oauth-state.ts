// File: backend/src/oauth-state.ts
/**
 * CSRF protection for the PayPal OAuth flow.
 *
 * Every login attempt gets a random, single-use `state` nonce that is kept
 * server-side for a short time. The callback only accepts a `state` that was
 * issued here and not yet used/expired. The nonce also remembers which
 * (allow-listed) frontend origin started the flow, so the token is posted
 * back to exactly that origin.
 *
 * Note: the store is in-memory. That is fine for a single Railway instance;
 * a restart only invalidates logins that are in progress right now.
 */

import { randomBytes } from 'crypto';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PENDING_STATES = 1000; // protects memory against flooding

interface PendingState {
  expiresAt: number;
  origin: string | null; // allow-listed origin that requested the login (if known)
}

const pendingStates = new Map<string, PendingState>();

function purgeExpired(now: number): void {
  for (const [state, entry] of pendingStates) {
    if (entry.expiresAt <= now) pendingStates.delete(state);
  }
}

/**
 * Create a new single-use state nonce (256 bit, URL-safe).
 */
export function createOAuthState(origin: string | null): string {
  const now = Date.now();
  purgeExpired(now);

  // Drop the oldest entries if somebody floods the endpoint
  while (pendingStates.size >= MAX_PENDING_STATES) {
    const oldest = pendingStates.keys().next().value;
    if (oldest === undefined) break;
    pendingStates.delete(oldest);
  }

  const state = randomBytes(32).toString('base64url');
  pendingStates.set(state, { expiresAt: now + STATE_TTL_MS, origin });
  return state;
}

/**
 * Validate and consume a state nonce. Returns null if unknown/expired/used.
 */
export function consumeOAuthState(state: unknown): PendingState | null {
  if (typeof state !== 'string' || state.length === 0 || state.length > 128) {
    return null;
  }
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state); // single use
  if (entry.expiresAt <= Date.now()) return null;
  return entry;
}
