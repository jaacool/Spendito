// File: src/services/backendApi.ts
/**
 * Backend API Service
 *
 * Facade for the Spendito backend (Railway), which is a stateless PayPal proxy.
 * The former FinTS/Volksbank direct bank connection was removed.
 * PayPal tokens live on the client only (see paypalAuth.ts).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL, PayPalAuthError, paypalAuthService } from './paypalAuth';

// Keys written by the removed FinTS integration (incl. BLZ and bank login name).
// They are deleted once so no bank login data lingers on the device.
const LEGACY_FINTS_STORAGE_KEYS = [
  'backend_user_id',
  'backend_session_id',
  'backend_connection_id',
  'bank_blz',
  'bank_login_name',
];

class BackendApiService {
  private legacyCleanupDone = false;

  private async cleanupLegacyStorage(): Promise<void> {
    if (this.legacyCleanupDone) return;
    this.legacyCleanupDone = true;
    try {
      await AsyncStorage.multiRemove(LEGACY_FINTS_STORAGE_KEYS);
    } catch {
      // best effort only
    }
  }

  /**
   * Check PayPal connection status
   */
  async getPayPalStatus(): Promise<{ configured: boolean; connected: boolean; message?: string }> {
    await this.cleanupLegacyStorage();
    try {
      const connected = await paypalAuthService.isConnected();
      const response = await fetch(`${BACKEND_URL}/api/paypal/status`);
      const data = await response.json();

      return {
        configured: data.configured === true,
        connected,
        message: connected ? 'PayPal verbunden' : 'Nicht verbunden',
      };
    } catch {
      return { configured: false, connected: false };
    }
  }

  /**
   * Connect PayPal (OAuth flow)
   */
  async connectPayPal(): Promise<void> {
    return paypalAuthService.connectPayPal();
  }

  /**
   * Sync PayPal transactions via proxy
   * Backend returns transactions directly, doesn't store them
   */
  async syncPayPal(startDate?: string, endDate?: string): Promise<{
    success: boolean;
    transactionsFound: number;
    transactionsAdded: number;
    needsAuth?: boolean;
    error?: string;
    transactions?: any[];
  }> {
    try {
      return await paypalAuthService.syncTransactions(startDate, endDate);
    } catch (error) {
      // Use stable error codes instead of matching on message text
      if (error instanceof PayPalAuthError && (error.code === 'NOT_CONNECTED' || error.code === 'SESSION_EXPIRED')) {
        return { success: false, transactionsFound: 0, transactionsAdded: 0, needsAuth: true };
      }
      throw error;
    }
  }

  /**
   * Disconnect PayPal
   */
  async disconnectPayPal(): Promise<void> {
    return paypalAuthService.disconnect();
  }
}

export const backendApiService = new BackendApiService();
