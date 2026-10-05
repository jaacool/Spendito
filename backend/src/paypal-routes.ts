// File: backend/src/paypal-routes.ts
/**
 * PayPal routes.
 *
 * The backend is a STATELESS proxy: PayPal tokens and transactions are never
 * stored server-side. The client keeps its tokens locally and sends the
 * access token with every sync request (in the body, never in the URL).
 * Therefore there is no per-user data on the server that could be read by
 * guessing a user id.
 *
 * Legacy note: older clients append a fixed user id to some paths
 * (e.g. /auth-url/spendito_main_user). That optional segment is accepted
 * and ignored so old and new client builds keep working during rollout.
 */

import { Router, type Request, type Response } from 'express';
import { BACKEND_URL, ALLOWED_ORIGINS, PAYPAL_CLIENT_ID, isAllowedOrigin } from './config.js';
import { createOAuthState, consumeOAuthState } from './oauth-state.js';
import {
  PayPalApiError,
  exchangeCodeForToken,
  fetchUserTransactions,
  isPayPalConfigured,
  refreshUserToken,
} from './paypal-client.js';
import { transformPayPalTransactions } from './paypal-transform.js';
import { CALLBACK_MESSAGES, sendCallbackErrorPage, sendCallbackSuccessPage } from './paypal-callback-page.js';

const router = Router();

const REDIRECT_URI = `${BACKEND_URL}/api/paypal/callback`;
const MAX_TOKEN_LENGTH = 4096;
const MAX_HISTORY_MS = 3 * 365 * 24 * 60 * 60 * 1000; // PayPal keeps 3 years of history

const ERRORS = {
  notConfigured: { code: 'PAYPAL_NOT_CONFIGURED', error: 'PayPal ist auf dem Server nicht eingerichtet.' },
  invalidInput: { code: 'INVALID_INPUT', error: 'Ungültige Anfrage.' },
  invalidRange: { code: 'INVALID_DATE_RANGE', error: 'Der gewählte Zeitraum ist ungültig.' },
  noToken: { code: 'PAYPAL_NOT_CONNECTED', error: 'PayPal ist nicht verbunden. Bitte verbinde PayPal erneut.', needsAuth: true },
  authExpired: { code: 'PAYPAL_AUTH_EXPIRED', error: 'Die PayPal-Anmeldung ist abgelaufen. Bitte verbinde PayPal erneut.', needsAuth: true },
  upstream: { code: 'PAYPAL_UNAVAILABLE', error: 'PayPal ist gerade nicht erreichbar. Bitte versuche es später erneut.' },
  internal: { code: 'INTERNAL_ERROR', error: 'Ein interner Fehler ist aufgetreten. Bitte versuche es später erneut.' },
} as const;

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/** Parse an optional ISO date string. Returns undefined if absent, null if invalid. */
function parseOptionalDate(value: unknown): Date | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 40) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Map an upstream PayPal failure to a generic German response. */
function sendPayPalError(res: Response, error: unknown, context: string): void {
  if (error instanceof PayPalApiError) {
    // For token refresh PayPal answers 400 (invalid_grant) when the refresh token is no longer valid
    const authFailed =
      error.status === 401 || error.status === 403 || (context === 'token refresh' && error.status === 400);
    if (authFailed) {
      res.status(401).json(ERRORS.authExpired);
      return;
    }
    res.status(502).json(ERRORS.upstream);
    return;
  }
  // Network errors etc. - log only the error name/message, no request data
  console.error(`[PayPal] ${context} failed:`, error instanceof Error ? error.message : 'unknown error');
  res.status(500).json(ERRORS.internal);
}

/**
 * Get PayPal OAuth login URL (with a fresh single-use CSRF state nonce).
 */
router.get('/auth-url{/:legacyUserId}', (req: Request, res: Response) => {
  if (!PAYPAL_CLIENT_ID) {
    res.status(503).json(ERRORS.notConfigured);
    return;
  }

  // Remember the requesting frontend (only if allow-listed) so the callback
  // posts the token back to exactly that origin.
  const origin = req.get('origin');
  const state = createOAuthState(isAllowedOrigin(origin) ? origin : null);

  const params = new URLSearchParams({
    client_id: PAYPAL_CLIENT_ID,
    response_type: 'code',
    scope: ['openid', 'email', 'https://uri.paypal.com/services/reporting/search/read'].join(' '),
    redirect_uri: REDIRECT_URI,
    state,
  });

  res.set('Cache-Control', 'no-store');
  res.json({
    authUrl: `https://www.paypal.com/signin/authorize?${params.toString()}`,
    redirectUri: REDIRECT_URI,
    state,
  });
});

/**
 * PayPal OAuth callback - verifies state, exchanges code for token and hands
 * the token to the opener window of an allow-listed origin.
 */
router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  // User cancelled on PayPal (or PayPal reported an error)
  if (error !== undefined) {
    consumeOAuthState(state);
    sendCallbackErrorPage(res, 400, CALLBACK_MESSAGES.cancelled);
    return;
  }

  const pending = consumeOAuthState(state);
  if (!pending || !isNonEmptyString(code, 2048)) {
    sendCallbackErrorPage(res, 400, CALLBACK_MESSAGES.invalidState);
    return;
  }

  try {
    const token = await exchangeCodeForToken(code, REDIRECT_URI);
    const targets = pending.origin ? [pending.origin] : ALLOWED_ORIGINS;
    if (targets.length === 0) {
      console.warn('[PayPal] OAuth succeeded but ALLOWED_ORIGINS is empty - token cannot be delivered');
    }
    sendCallbackSuccessPage(res, token, state as string, targets);
  } catch (err) {
    if (!(err instanceof PayPalApiError)) {
      console.error('[PayPal] Callback failed:', err instanceof Error ? err.message : 'unknown error');
    }
    sendCallbackErrorPage(res, 502, CALLBACK_MESSAGES.exchangeFailed);
  }
});

/**
 * Report whether PayPal is configured on the server (connection status itself
 * is client-side, since the client holds the token).
 */
router.get('/status{/:legacyUserId}', (_req: Request, res: Response) => {
  const configured = isPayPalConfigured();
  res.json({
    configured,
    message: configured ? 'PayPal API konfiguriert' : 'PayPal API nicht konfiguriert',
  });
});

/**
 * Refresh an access token using the client's refresh token.
 */
router.post('/refresh-token', async (req: Request, res: Response) => {
  const refreshToken = req.body?.refreshToken;
  if (!isNonEmptyString(refreshToken, MAX_TOKEN_LENGTH)) {
    res.status(400).json(ERRORS.invalidInput);
    return;
  }
  if (!isPayPalConfigured()) {
    res.status(503).json(ERRORS.notConfigured);
    return;
  }

  try {
    const newToken = await refreshUserToken(refreshToken);
    res.set('Cache-Control', 'no-store');
    res.json(newToken);
  } catch (error) {
    sendPayPalError(res, error, 'token refresh');
  }
});

/**
 * Sync PayPal transactions - pure proxy, nothing is stored on the server.
 */
router.post('/sync{/:legacyUserId}', async (req: Request, res: Response) => {
  const { accessToken, startDate, endDate } = req.body ?? {};

  if (accessToken === undefined || accessToken === null || accessToken === '') {
    res.status(401).json(ERRORS.noToken);
    return;
  }
  if (!isNonEmptyString(accessToken, MAX_TOKEN_LENGTH)) {
    res.status(400).json(ERRORS.invalidInput);
    return;
  }

  const parsedStart = parseOptionalDate(startDate);
  const parsedEnd = parseOptionalDate(endDate);
  if (parsedStart === null || parsedEnd === null) {
    res.status(400).json(ERRORS.invalidRange);
    return;
  }

  // Clamp to PayPal's 3-year history window and to "now"
  const now = Date.now();
  const end = new Date(Math.min(parsedEnd?.getTime() ?? now, now));
  const start = new Date(Math.max(parsedStart?.getTime() ?? 0, now - MAX_HISTORY_MS));
  if (start >= end) {
    res.status(400).json(ERRORS.invalidRange);
    return;
  }

  try {
    const rawTransactions = await fetchUserTransactions(accessToken, start, end);
    const transactions = transformPayPalTransactions(rawTransactions);
    console.log(`[PayPal Proxy] Sync done: ${rawTransactions.length} fetched, ${transactions.length} returned (not stored)`);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      transactionsFound: rawTransactions.length,
      transactionsAdded: transactions.length,
      transactions,
    });
  } catch (error) {
    sendPayPalError(res, error, 'sync');
  }
});

export default router;
