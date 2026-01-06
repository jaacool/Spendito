/**
 * Backend API Service
 * 
 * Connects to the Spendito Backend (Railway) for FinTS/HBCI bank integration.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '../types';
import { categorizationService } from './categorization';

// Backend URL
const BACKEND_URL = 'https://spendito-production.up.railway.app';

// Storage keys
const STORAGE_KEYS = {
  USER_ID: 'backend_user_id',
  SESSION_ID: 'backend_session_id',
  CONNECTION_ID: 'backend_connection_id',
  // Bank credentials (encrypted in production)
  BANK_ID: 'bank_blz',
  BANK_LOGIN: 'bank_login_name',
};

export interface BankAccount {
  id: string;
  account_number: string;
  iban?: string;
  account_name?: string;
}

export interface BackendTransaction {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  counterparty_name?: string;
  description?: string;
  category?: string;
}

export interface InitResult {
  sessionId: string;
  connectionId: string;
  tanMethods: Array<{ id: string; name: string }>;
  requiresTan?: boolean;
  tanChallenge?: string;
  accounts?: BankAccount[];
  error?: string;
}

class BackendApiService {
  private userId: string | null = null;

  /**
   * Initialize service and get/create user ID
   */
  async initialize(): Promise<void> {
    this.userId = await AsyncStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!this.userId) {
      // Generate a simple user ID for single-user setup
      this.userId = 'user_' + Date.now().toString(36);
      await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, this.userId);
    }
  }

  /**
   * Check if backend is reachable
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Initialize bank connection (Step 1)
   */
  async initBankConnection(
    bankId: string,
    loginName: string,
    pin: string
  ): Promise<InitResult> {
    await this.initialize();

    console.log('[BackendAPI] Initiating bank connection to:', BACKEND_URL);
    
    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/api/fints/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          bankId,
          loginName,
          pin,
        }),
      });
    } catch (fetchError: any) {
      console.error('[BackendAPI] Fetch error:', fetchError);
      throw new Error(`Netzwerkfehler: ${fetchError.message || 'Server nicht erreichbar'}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('[BackendAPI] JSON parse error:', jsonError);
      throw new Error(`Server-Antwort ungültig (Status: ${response.status})`);
    }

    console.log('[BackendAPI] Response status:', response.status);
    console.log('[BackendAPI] Response data:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    // Store session and connection IDs
    if (data.sessionId) {
      await AsyncStorage.setItem(STORAGE_KEYS.SESSION_ID, data.sessionId);
    }
    if (data.connectionId) {
      await AsyncStorage.setItem(STORAGE_KEYS.CONNECTION_ID, data.connectionId);
    }
    
    // Save bank credentials (BLZ and login name) for future syncs
    // Note: PIN is NOT saved for security reasons
    await AsyncStorage.setItem(STORAGE_KEYS.BANK_ID, bankId);
    await AsyncStorage.setItem(STORAGE_KEYS.BANK_LOGIN, loginName);

    return data;
  }

  /**
   * Get saved bank credentials (BLZ and login name only, no PIN)
   */
  async getSavedBankCredentials(): Promise<{ bankId: string; loginName: string } | null> {
    const bankId = await AsyncStorage.getItem(STORAGE_KEYS.BANK_ID);
    const loginName = await AsyncStorage.getItem(STORAGE_KEYS.BANK_LOGIN);
    
    if (bankId && loginName) {
      return { bankId, loginName };
    }
    return null;
  }

  /**
   * Select TAN method (Step 2)
   */
  async selectTanMethod(sessionId: string, tanMethodId: string): Promise<InitResult> {
    const response = await fetch(`${BACKEND_URL}/api/fints/select-tan-method`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, tanMethodId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to select TAN method');
    }

    return data;
  }

  /**
   * Fetch transactions (Step 3)
   */
  async fetchTransactions(
    sessionId: string,
    accountId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<{ success: boolean; transactionsAdded: number; requiresTan?: boolean; tanChallenge?: string }> {
    const response = await fetch(`${BACKEND_URL}/api/fints/fetch-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, accountId, fromDate, toDate }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to fetch transactions');
    }

    return data;
  }

  /**
   * Get all transactions from backend
   */
  async getTransactions(fromDate?: string, toDate?: string): Promise<Transaction[]> {
    await this.initialize();
    await categorizationService.initialize();

    let url = `${BACKEND_URL}/api/transactions/${this.userId}`;
    const params = new URLSearchParams();
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data: BackendTransaction[] = await response.json();

    // Convert to app Transaction format
    return data.map((tx) => {
      const isIncome = tx.amount > 0;
      const { category, confidence } = tx.category 
        ? { category: tx.category as any, confidence: 1 }
        : categorizationService.categorize(tx.description || tx.counterparty_name || '', tx.amount);

      return {
        id: tx.id,
        date: new Date(tx.date).toISOString(),
        amount: tx.amount,
        type: isIncome ? 'income' : 'expense',
        category,
        description: tx.description || tx.counterparty_name || 'Unbekannt',
        counterparty: tx.counterparty_name || 'Unbekannt',
        isManuallyCategized: false,
        confidence,
        sourceAccount: 'volksbank',
        externalId: tx.id,
      } as Transaction;
    });
  }

  /**
   * Get stored connection status
   */
  async getConnectionStatus(): Promise<{ connected: boolean; connectionId?: string }> {
    const connectionId = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_ID);
    return {
      connected: !!connectionId,
      connectionId: connectionId || undefined,
    };
  }

  /**
   * Get bank accounts for connection
   */
  async getAccounts(connectionId: string): Promise<BankAccount[]> {
    const response = await fetch(`${BACKEND_URL}/api/accounts/${connectionId}`);
    return response.json();
  }

  /**
   * Disconnect bank
   */
  async disconnect(): Promise<void> {
    const connectionId = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_ID);
    
    if (connectionId) {
      try {
        await fetch(`${BACKEND_URL}/api/connections/${connectionId}`, {
          method: 'DELETE',
        });
      } catch {
        // Ignore errors
      }
    }

    await AsyncStorage.multiRemove([
      STORAGE_KEYS.SESSION_ID,
      STORAGE_KEYS.CONNECTION_ID,
    ]);
  }

  /**
   * End active session
   */
  async endSession(): Promise<void> {
    const sessionId = await AsyncStorage.getItem(STORAGE_KEYS.SESSION_ID);
    
    if (sessionId) {
      try {
        await fetch(`${BACKEND_URL}/api/fints/end-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Ignore errors
      }
    }

    await AsyncStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  }

  // ============================================
  // PayPal Methods
  // ============================================

  /**
   * Check PayPal connection status
   */
  async getPayPalStatus(): Promise<{ configured: boolean; connected: boolean; message?: string }> {
    try {
      await this.initialize();
      const response = await fetch(`${BACKEND_URL}/api/paypal/status/${this.userId}`);
      return response.json();
    } catch {
      return { configured: false, connected: false };
    }
  }

  /**
   * Get PayPal OAuth login URL
   */
  async getPayPalAuthUrl(): Promise<string> {
    await this.initialize();
    
    const response = await fetch(`${BACKEND_URL}/api/paypal/auth-url/${this.userId}`);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get PayPal auth URL');
    }
    
    return data.authUrl;
  }

  /**
   * Sync PayPal transactions
   */
  async syncPayPal(startDate?: string, endDate?: string): Promise<{ success: boolean; transactionsFound: number; transactionsAdded: number; needsAuth?: boolean; error?: string }> {
    await this.initialize();

    console.log(`[PayPal] Starting sync for user ${this.userId}`);
    const response = await fetch(`${BACKEND_URL}/api/paypal/sync/${this.userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate }),
    });

    const text = await response.text();
    console.log(`[PayPal] Raw sync response:`, text);
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Ungültige Server-Antwort: ${text.substring(0, 100)}`);
    }

    if (!response.ok) {
      if (data.needsAuth) {
        return { success: false, transactionsFound: 0, transactionsAdded: 0, needsAuth: true };
      }
      throw new Error(data.error || 'PayPal sync failed');
    }

    return data;
  }

  /**
   * Get PayPal transactions
   */
  async getPayPalTransactions(fromDate?: string, toDate?: string): Promise<Transaction[]> {
    await this.initialize();
    await categorizationService.initialize();

    let url = `${BACKEND_URL}/api/paypal/transactions/${this.userId}`;
    const params = new URLSearchParams();
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url);
    const data: BackendTransaction[] = await response.json();

    return data.map((tx) => {
      const isIncome = tx.amount > 0;
      const { category, confidence } = tx.category 
        ? { category: tx.category as any, confidence: 1 }
        : categorizationService.categorize(tx.description || tx.counterparty_name || '', tx.amount);

      return {
        id: tx.id,
        date: new Date(tx.date).toISOString(),
        amount: tx.amount,
        type: isIncome ? 'income' : 'expense',
        category,
        description: tx.description || tx.counterparty_name || 'PayPal',
        counterparty: tx.counterparty_name || 'PayPal',
        isManuallyCategized: false,
        confidence,
        sourceAccount: 'paypal',
        externalId: tx.id,
      } as Transaction;
    });
  }

  /**
   * Disconnect PayPal
   */
  async disconnectPayPal(): Promise<void> {
    await this.initialize();
    
    try {
      await fetch(`${BACKEND_URL}/api/paypal/disconnect/${this.userId}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore errors
    }
  }
}

export const backendApiService = new BackendApiService();
