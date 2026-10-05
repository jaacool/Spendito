// File: src/services/paypalAuth.ts
/**
 * PayPal OAuth Client-Side Service
 *
 * Manages PayPal OAuth tokens on the client (AsyncStorage = localStorage on web).
 * The backend is a stateless proxy and never stores tokens or transactions.
 *
 * Login flow (web):
 * 1. Backend issues an auth URL with a random single-use `state` nonce.
 * 2. PayPal popup -> backend callback page, which posts the token ONLY to
 *    allow-listed frontend origins.
 * 3. We accept the message only if it comes from the backend origin, from the
 *    popup we opened, has the expected shape and carries our `state`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://spendito-production.up.railway.app';

const LOCAL_DEV_BACKEND_ORIGIN = 'http://localhost:3001';
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

const STORAGE_KEYS = {
  PAYPAL_TOKEN: 'paypal_access_token',
  PAYPAL_REFRESH_TOKEN: 'paypal_refresh_token',
  PAYPAL_TOKEN_EXPIRY: 'paypal_token_expiry',
};

export interface PayPalToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  refresh_token?: string;
}

export type PayPalAuthErrorCode = 'NOT_CONNECTED' | 'SESSION_EXPIRED' | 'CONNECT_FAILED' | 'SYNC_FAILED';

/** Error with a stable code, so callers don't have to match on message text. */
export class PayPalAuthError extends Error {
  constructor(public readonly code: PayPalAuthErrorCode, message: string) {
    super(message);
    this.name = 'PayPalAuthError';
  }
}

/** Origins from which the OAuth callback page may post messages. */
function getTrustedCallbackOrigins(): string[] {
  const origins: string[] = [];
  try {
    origins.push(new URL(BACKEND_URL).origin);
  } catch {
    // invalid BACKEND_URL - no origin trusted
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    origins.push(LOCAL_DEV_BACKEND_ORIGIN);
  }
  return origins;
}

function isValidTokenPayload(token: any): token is PayPalToken {
  return (
    !!token &&
    typeof token === 'object' &&
    typeof token.access_token === 'string' &&
    token.access_token.length > 0 &&
    typeof token.expires_in === 'number' &&
    Number.isFinite(token.expires_in) &&
    (token.refresh_token === undefined || typeof token.refresh_token === 'string')
  );
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

class PayPalAuthService {
  /**
   * Check if user is connected (has valid token)
   */
  async isConnected(): Promise<boolean> {
    const token = await this.getValidToken();
    return !!token;
  }

  /**
   * Get PayPal OAuth URL and open popup
   */
  async connectPayPal(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/paypal/auth-url`);
    } catch {
      throw new PayPalAuthError('CONNECT_FAILED', 'Der Spendito-Server ist nicht erreichbar. Bitte prüfe deine Internetverbindung.');
    }
    const data = await readJson(response);

    if (!response.ok || typeof data.authUrl !== 'string' || typeof data.state !== 'string') {
      throw new PayPalAuthError('CONNECT_FAILED', 'Die PayPal-Anmeldung konnte nicht gestartet werden. Bitte versuche es später erneut.');
    }

    const expectedState: string = data.state;
    const trustedOrigins = getTrustedCallbackOrigins();

    // Open OAuth popup
    const width = 500;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      data.authUrl,
      'PayPal Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      throw new PayPalAuthError('CONNECT_FAILED', 'Das PayPal-Fenster wurde blockiert. Bitte erlaube Pop-ups für Spendito und versuche es erneut.');
    }

    // Listen for token from callback page
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new PayPalAuthError('CONNECT_FAILED', 'Die PayPal-Anmeldung hat zu lange gedauert. Bitte versuche es erneut.'));
      }, OAUTH_TIMEOUT_MS);

      const messageHandler = async (event: MessageEvent) => {
        // Security: exact origin match + must come from the popup we opened
        if (!trustedOrigins.includes(event.origin)) return;
        if (event.source !== popup) return;

        const msg = event.data;
        if (!msg || typeof msg !== 'object' || msg.type !== 'PAYPAL_CONNECTED') return;
        if (msg.state !== expectedState) return; // CSRF: not the login we started
        if (!isValidTokenPayload(msg.token)) return;

        cleanup();
        try {
          await this.storeToken(msg.token);
          popup.close();
          resolve();
        } catch {
          reject(new PayPalAuthError('CONNECT_FAILED', 'Die PayPal-Anmeldung konnte nicht gespeichert werden.'));
        }
      };

      window.addEventListener('message', messageHandler);
    });
  }

  /**
   * Store token locally
   */
  private async storeToken(token: PayPalToken): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.PAYPAL_TOKEN, token.access_token);
    await AsyncStorage.setItem(
      STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY,
      (Date.now() + (token.expires_in - 60) * 1000).toString()
    );

    if (token.refresh_token) {
      await AsyncStorage.setItem(STORAGE_KEYS.PAYPAL_REFRESH_TOKEN, token.refresh_token);
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string | null> {
    const token = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_TOKEN);
    const expiryStr = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY);

    if (!token || !expiryStr) {
      return null;
    }

    // Token still valid
    const expiry = parseInt(expiryStr, 10);
    if (Date.now() < expiry) {
      return token;
    }

    // Try to refresh
    const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_REFRESH_TOKEN);
    if (!refreshToken) {
      return null;
    }

    const result = await this.refreshToken(refreshToken);
    if (result === 'invalid') {
      // PayPal rejected the refresh token -> the connection is really gone
      await this.disconnect();
      return null;
    }
    if (result === 'unavailable') {
      // Temporary problem (network/server) - keep the stored connection
      return null;
    }

    await this.storeToken(result);
    return result.access_token;
  }

  /**
   * Refresh access token using refresh_token.
   * Returns 'invalid' if PayPal rejected it, 'unavailable' on temporary errors.
   */
  private async refreshToken(refreshToken: string): Promise<PayPalToken | 'invalid' | 'unavailable'> {
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/paypal/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      return 'unavailable';
    }

    if (response.status === 401 || response.status === 400) {
      return 'invalid';
    }
    if (!response.ok) {
      return 'unavailable';
    }

    const data = await readJson(response);
    return isValidTokenPayload(data) ? data : 'unavailable';
  }

  /**
   * Disconnect PayPal (clear local tokens - nothing is stored server-side)
   */
  async disconnect(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PAYPAL_TOKEN,
      STORAGE_KEYS.PAYPAL_REFRESH_TOKEN,
      STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY,
    ]);
  }

  /**
   * Sync PayPal transactions (requires valid token)
   * Backend acts as proxy only - transactions are returned directly
   */
  async syncTransactions(startDate?: string, endDate?: string): Promise<{
    success: boolean;
    transactionsFound: number;
    transactionsAdded: number;
    transactions?: any[];
  }> {
    const accessToken = await this.getValidToken();

    if (!accessToken) {
      throw new PayPalAuthError('NOT_CONNECTED', 'PayPal ist nicht verbunden. Bitte verbinde PayPal zuerst.');
    }

    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/paypal/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, accessToken }),
      });
    } catch {
      throw new PayPalAuthError('SYNC_FAILED', 'Der Spendito-Server ist nicht erreichbar. Bitte prüfe deine Internetverbindung.');
    }

    const data = await readJson(response);

    if (!response.ok) {
      if (data.needsAuth) {
        await this.disconnect();
        throw new PayPalAuthError('SESSION_EXPIRED', 'Die PayPal-Anmeldung ist abgelaufen. Bitte verbinde PayPal erneut.');
      }
      // Backend only returns generic German messages; fall back to our own
      const message = typeof data.error === 'string' && data.error
        ? data.error
        : 'PayPal-Synchronisierung fehlgeschlagen. Bitte versuche es später erneut.';
      throw new PayPalAuthError('SYNC_FAILED', message);
    }

    return data;
  }
}

export const paypalAuthService = new PayPalAuthService();
