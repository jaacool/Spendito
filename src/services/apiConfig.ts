/**
 * API Configuration Service
 * 
 * Manages API credentials for PayPal and GoCardless.
 * In production, these should be stored securely (e.g., in a backend).
 * For the app, we store connection tokens in AsyncStorage after OAuth.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { paypalApiService } from './paypalApi';
import { gocardlessApiService } from './gocardlessApi';

// Storage keys
const STORAGE_KEYS = {
  PAYPAL_CONNECTED: 'paypal_connected',
  PAYPAL_ACCESS_TOKEN: 'paypal_access_token',
  PAYPAL_REFRESH_TOKEN: 'paypal_refresh_token',
  GOCARDLESS_REQUISITION_ID: 'gocardless_requisition_id',
  GOCARDLESS_ACCOUNT_ID: 'gocardless_account_id',
  GOCARDLESS_INSTITUTION_NAME: 'gocardless_institution_name',
};

// API Configuration (these would typically come from environment variables or a backend)
// For development, you can set these directly
const API_CONFIG = {
  paypal: {
    clientId: process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.EXPO_PUBLIC_PAYPAL_CLIENT_SECRET || '',
    mode: 'live' as const,
  },
  gocardless: {
    secretId: process.env.EXPO_PUBLIC_GOCARDLESS_SECRET_ID || '',
    secretKey: process.env.EXPO_PUBLIC_GOCARDLESS_SECRET_KEY || '',
  },
};

export interface ConnectionStatus {
  paypal: {
    connected: boolean;
    email?: string;
  };
  volksbank: {
    connected: boolean;
    institutionName?: string;
    accountId?: string;
  };
}

class ApiConfigService {
  private initialized = false;

  /**
   * Initialize API services with stored credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Initialize PayPal if credentials are available
    if (API_CONFIG.paypal.clientId && API_CONFIG.paypal.clientSecret) {
      paypalApiService.initialize(API_CONFIG.paypal);
    }

    // Initialize GoCardless if credentials are available
    if (API_CONFIG.gocardless.secretId && API_CONFIG.gocardless.secretKey) {
      gocardlessApiService.initialize(API_CONFIG.gocardless);
    }

    this.initialized = true;
  }

  /**
   * Check connection status for all services
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    const [paypalConnected, gcAccountId, gcInstitutionName] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.PAYPAL_CONNECTED),
      AsyncStorage.getItem(STORAGE_KEYS.GOCARDLESS_ACCOUNT_ID),
      AsyncStorage.getItem(STORAGE_KEYS.GOCARDLESS_INSTITUTION_NAME),
    ]);

    return {
      paypal: {
        connected: paypalConnected === 'true',
      },
      volksbank: {
        connected: !!gcAccountId,
        institutionName: gcInstitutionName || undefined,
        accountId: gcAccountId || undefined,
      },
    };
  }

  /**
   * Check if PayPal API is configured
   */
  isPayPalConfigured(): boolean {
    return !!(API_CONFIG.paypal.clientId && API_CONFIG.paypal.clientSecret);
  }

  /**
   * Check if GoCardless API is configured
   */
  isGoCardlessConfigured(): boolean {
    return !!(API_CONFIG.gocardless.secretId && API_CONFIG.gocardless.secretKey);
  }

  /**
   * Save PayPal connection
   */
  async savePayPalConnection(connected: boolean): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.PAYPAL_CONNECTED, connected.toString());
  }

  /**
   * Save GoCardless/Bank connection
   */
  async saveBankConnection(
    requisitionId: string,
    accountId: string,
    institutionName: string
  ): Promise<void> {
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.GOCARDLESS_REQUISITION_ID, requisitionId),
      AsyncStorage.setItem(STORAGE_KEYS.GOCARDLESS_ACCOUNT_ID, accountId),
      AsyncStorage.setItem(STORAGE_KEYS.GOCARDLESS_INSTITUTION_NAME, institutionName),
    ]);
  }

  /**
   * Get stored bank account ID
   */
  async getBankAccountId(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.GOCARDLESS_ACCOUNT_ID);
  }

  /**
   * Disconnect PayPal
   */
  async disconnectPayPal(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.PAYPAL_CONNECTED,
      STORAGE_KEYS.PAYPAL_ACCESS_TOKEN,
      STORAGE_KEYS.PAYPAL_REFRESH_TOKEN,
    ]);
  }

  /**
   * Disconnect Bank
   */
  async disconnectBank(): Promise<void> {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.GOCARDLESS_REQUISITION_ID,
      STORAGE_KEYS.GOCARDLESS_ACCOUNT_ID,
      STORAGE_KEYS.GOCARDLESS_INSTITUTION_NAME,
    ]);
  }

  /**
   * Get PayPal OAuth URL for user authorization
   */
  getPayPalAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: API_CONFIG.paypal.clientId,
      response_type: 'code',
      scope: 'openid https://uri.paypal.com/services/reporting/search/read',
      redirect_uri: redirectUri,
    });
    
    return `https://www.paypal.com/signin/authorize?${params.toString()}`;
  }
}

export const apiConfigService = new ApiConfigService();
