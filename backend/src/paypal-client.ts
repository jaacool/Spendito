// File: backend/src/paypal-client.ts
/**
 * Thin client for the PayPal REST API (OAuth token handling + reporting API).
 *
 * Security notes:
 * - Tokens are never logged.
 * - Upstream error bodies are never forwarded to the frontend; only the HTTP
 *   status and PayPal's non-sensitive `debug_id` are logged server-side.
 */

import { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } from './config.js';

const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // Live API

// PayPal reporting API: max 31 days per request, max 500 entries per page
const CHUNK_SIZE_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;
const MAX_PAGES_PER_CHUNK = 50; // safety net against endless loops

/** Token fields that are passed on to the frontend (everything else is dropped). */
export interface PayPalToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/** Error carrying the upstream HTTP status, so routes can map it to a German message. */
export class PayPalApiError extends Error {
  constructor(public readonly status: number, context: string) {
    super(`PayPal API error (${context}): HTTP ${status}`);
    this.name = 'PayPalApiError';
  }
}

export function isPayPalConfigured(): boolean {
  return !!PAYPAL_CLIENT_ID && !!PAYPAL_CLIENT_SECRET;
}

async function logUpstreamError(context: string, response: Response): Promise<void> {
  let debugId: string | undefined;
  try {
    const body = (await response.json()) as { debug_id?: unknown };
    if (typeof body?.debug_id === 'string') debugId = body.debug_id;
  } catch {
    // body was not JSON - ignore
  }
  console.error(`[PayPal] ${context} failed: HTTP ${response.status}${debugId ? ` (debug_id ${debugId})` : ''}`);
}

function sanitizeToken(data: any): PayPalToken {
  if (!data || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
    throw new PayPalApiError(502, 'invalid token response');
  }
  const token: PayPalToken = {
    access_token: data.access_token,
    token_type: typeof data.token_type === 'string' ? data.token_type : 'Bearer',
    expires_in: data.expires_in,
  };
  if (typeof data.refresh_token === 'string') token.refresh_token = data.refresh_token;
  return token;
}

async function requestToken(body: URLSearchParams, context: string): Promise<PayPalToken> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(), // URLSearchParams takes care of proper encoding
  });

  if (!response.ok) {
    await logUpstreamError(context, response);
    throw new PayPalApiError(response.status, context);
  }
  return sanitizeToken(await response.json());
}

/** Exchange an OAuth authorization code for a user access token. */
export function exchangeCodeForToken(code: string, redirectUri: string): Promise<PayPalToken> {
  return requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    'token exchange'
  );
}

/** Get a fresh access token with a refresh token. */
export function refreshUserToken(refreshToken: string): Promise<PayPalToken> {
  return requestToken(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    'token refresh'
  );
}

function formatPayPalDate(date: Date): string {
  // PayPal requires YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
  return date.toISOString().split('.')[0] + 'Z';
}

/**
 * Fetch all transactions between start and end.
 * Splits the range into 30-day chunks (API limit) and follows pagination.
 */
export async function fetchUserTransactions(accessToken: string, start: Date, end: Date): Promise<any[]> {
  const allTransactions: any[] = [];
  let currentStart = start;

  while (currentStart < end) {
    let currentEnd = new Date(currentStart.getTime() + CHUNK_SIZE_MS);
    if (currentEnd > end) currentEnd = end;

    let page = 1;
    let totalPages = 1;
    do {
      const params = new URLSearchParams({
        start_date: formatPayPalDate(currentStart),
        end_date: formatPayPalDate(currentEnd),
        page_size: String(PAGE_SIZE),
        page: String(page),
        fields: 'all',
      });

      const response = await fetch(`${PAYPAL_API_BASE}/v1/reporting/transactions?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        await logUpstreamError('transaction search', response);
        throw new PayPalApiError(response.status, 'transaction search');
      }

      const data = (await response.json()) as any;
      if (Array.isArray(data.transaction_details)) {
        allTransactions.push(...data.transaction_details);
      }
      totalPages = typeof data.total_pages === 'number' ? data.total_pages : 1;
      page++;
    } while (page <= totalPages && page <= MAX_PAGES_PER_CHUNK);

    // Next chunk starts one second after this one ended (API ranges are inclusive)
    currentStart = new Date(currentEnd.getTime() + 1000);
  }

  return allTransactions;
}
