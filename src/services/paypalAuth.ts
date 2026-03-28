/**
 * PayPal OAuth Client-Side Service
 * 
 * Manages PayPal OAuth tokens in browser localStorage.
 * No server-side token storage - everything is client-side.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = 'https://spendito-production.up.railway.app';

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

class PayPalAuthService {
  private userId = 'spendito_main_user';

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
    try {
      // Get auth URL from backend
      const response = await fetch(`${BACKEND_URL}/api/paypal/auth-url/${this.userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get auth URL');
      }

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

      // Listen for token from callback page
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          reject(new Error('OAuth timeout - Fenster wurde geschlossen'));
        }, 5 * 60 * 1000); // 5 min timeout

        const messageHandler = async (event: MessageEvent) => {
          // Security: Check origin
          if (!event.origin.includes('railway.app') && !event.origin.includes('localhost')) {
            return;
          }

          if (event.data.type === 'PAYPAL_CONNECTED' && event.data.token) {
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            
            // Store token client-side
            await this.storeToken(event.data.token);
            
            if (popup) popup.close();
            resolve();
          }
        };

        window.addEventListener('message', messageHandler);
      });
    } catch (error: any) {
      console.error('[PayPal Auth] Connection error:', error);
      throw error;
    }
  }

  /**
   * Store token in localStorage
   */
  private async storeToken(token: PayPalToken): Promise<void> {
    console.log('[PayPal Auth] Storing token, expires_in:', token.expires_in);
    await AsyncStorage.setItem(STORAGE_KEYS.PAYPAL_TOKEN, token.access_token);
    await AsyncStorage.setItem(
      STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY,
      (Date.now() + (token.expires_in - 60) * 1000).toString()
    );
    
    if (token.refresh_token) {
      await AsyncStorage.setItem(STORAGE_KEYS.PAYPAL_REFRESH_TOKEN, token.refresh_token);
      console.log('[PayPal Auth] Refresh token stored');
    }
    console.log('[PayPal Auth] Token stored successfully');
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidToken(): Promise<string | null> {
    console.log('[PayPal Auth] Getting valid token...');
    const token = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_TOKEN);
    const expiryStr = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY);
    
    console.log('[PayPal Auth] Token found:', !!token, 'Expiry found:', !!expiryStr);
    
    if (!token || !expiryStr) {
      console.log('[PayPal Auth] No token or expiry found in storage');
      return null;
    }

    const expiry = parseInt(expiryStr, 10);
    const now = Date.now();
    const timeUntilExpiry = expiry - now;
    
    console.log('[PayPal Auth] Token expiry check - Now:', now, 'Expiry:', expiry, 'Time until expiry (ms):', timeUntilExpiry);
    
    // Token still valid
    if (now < expiry) {
      console.log('[PayPal Auth] Token is still valid, returning it');
      return token;
    }

    console.log('[PayPal Auth] Token expired, attempting refresh...');
    // Try to refresh
    const refreshToken = await AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_REFRESH_TOKEN);
    if (refreshToken) {
      try {
        console.log('[PayPal Auth] Refresh token found, refreshing...');
        const newToken = await this.refreshToken(refreshToken);
        await this.storeToken(newToken);
        console.log('[PayPal Auth] Token refreshed successfully');
        return newToken.access_token;
      } catch (error) {
        console.error('[PayPal Auth] Token refresh failed:', error);
        await this.disconnect();
        return null;
      }
    }

    console.log('[PayPal Auth] No refresh token available');
    return null;
  }

  /**
   * Refresh access token using refresh_token
   */
  private async refreshToken(refreshToken: string): Promise<PayPalToken> {
    const response = await fetch(`${BACKEND_URL}/api/paypal/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    return response.json();
  }

  /**
   * Disconnect PayPal (clear local tokens)
   */
  async disconnect(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PAYPAL_TOKEN,
      STORAGE_KEYS.PAYPAL_REFRESH_TOKEN,
      STORAGE_KEYS.PAYPAL_TOKEN_EXPIRY,
    ]);

    // Also delete server-side data
    try {
      await fetch(`${BACKEND_URL}/api/paypal/disconnect/${this.userId}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Sync PayPal transactions (requires valid token)
   */
  async syncTransactions(startDate?: string, endDate?: string): Promise<{
    success: boolean;
    transactionsFound: number;
    transactionsAdded: number;
  }> {
    const accessToken = await this.getValidToken();
    
    if (!accessToken) {
      throw new Error('Nicht verbunden - bitte zuerst anmelden');
    }

    const response = await fetch(`${BACKEND_URL}/api/paypal/sync/${this.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, accessToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.needsAuth) {
        await this.disconnect();
        throw new Error('Session abgelaufen - bitte neu anmelden');
      }
      throw new Error(data.error || 'Sync failed');
    }

    return data;
  }
}

export const paypalAuthService = new PayPalAuthService();
