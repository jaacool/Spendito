/**
 * PayPal API Integration Service
 * 
 * This service provides integration with PayPal's REST API to fetch transactions.
 * 
 * SETUP REQUIRED:
 * 1. Create a PayPal Developer Account: https://developer.paypal.com
 * 2. Create an App in the Dashboard
 * 3. Get Client ID and Secret
 * 4. Set up environment variables:
 *    - PAYPAL_CLIENT_ID
 *    - PAYPAL_CLIENT_SECRET
 *    - PAYPAL_MODE ('sandbox' or 'live')
 */

import { Transaction, Category } from '../types';
import { categorizationService } from './categorization';

// PayPal API Configuration
interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  mode: 'sandbox' | 'live';
}

// PayPal API Response Types
interface PayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_event_code: string;
    transaction_initiation_date: string;
    transaction_updated_date: string;
    transaction_amount: {
      currency_code: string;
      value: string;
    };
    fee_amount?: {
      currency_code: string;
      value: string;
    };
    transaction_status: string;
    transaction_subject?: string;
    transaction_note?: string;
  };
  payer_info?: {
    email_address?: string;
    payer_name?: {
      given_name?: string;
      surname?: string;
    };
  };
  cart_info?: {
    item_details?: Array<{
      item_name?: string;
      item_description?: string;
    }>;
  };
}

interface PayPalTransactionResponse {
  transaction_details: PayPalTransaction[];
  total_items: number;
  total_pages: number;
  page: number;
}

class PayPalApiService {
  private config: PayPalConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  /**
   * Initialize the PayPal API with credentials
   */
  initialize(config: PayPalConfig): void {
    this.config = config;
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get the API base URL based on mode
   */
  private getBaseUrl(): string {
    if (!this.config) throw new Error('PayPal API not configured');
    return this.config.mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  /**
   * Get OAuth access token
   */
  private async getAccessToken(): Promise<string> {
    if (!this.config) throw new Error('PayPal API not configured');

    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    const auth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(`${this.getBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`PayPal auth failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return this.accessToken!;
  }

  /**
   * Fetch transactions from PayPal
   */
  async fetchTransactions(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<Transaction[]> {
    if (!this.config) {
      console.warn('PayPal API not configured, returning empty array');
      return [];
    }

    await categorizationService.initialize();
    const token = await this.getAccessToken();

    const transactions: Transaction[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const params = new URLSearchParams({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        page_size: '100',
        page: page.toString(),
        fields: 'all',
      });

      const response = await fetch(
        `${this.getBaseUrl()}/v1/reporting/transactions?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`PayPal API error: ${response.statusText}`);
      }

      const data: PayPalTransactionResponse = await response.json();

      for (const tx of data.transaction_details) {
        const converted = this.convertTransaction(tx);
        if (converted) {
          transactions.push(converted);
        }
      }

      hasMore = page < data.total_pages;
      page++;
    }

    return transactions;
  }

  /**
   * Convert PayPal transaction to our format
   */
  private convertTransaction(paypalTx: PayPalTransaction): Transaction | null {
    const info = paypalTx.transaction_info;
    
    // Skip pending or denied transactions
    if (info.transaction_status !== 'S') return null;

    // Skip internal transfers
    const skipCodes = ['T0400', 'T0401', 'T0500', 'T0501']; // Transfer codes
    if (skipCodes.includes(info.transaction_event_code)) return null;

    const amount = parseFloat(info.transaction_amount.value);
    const isExpense = amount < 0;

    // Build description
    let description = info.transaction_subject || '';
    if (paypalTx.cart_info?.item_details?.[0]?.item_name) {
      description = paypalTx.cart_info.item_details[0].item_name;
    }
    if (!description && info.transaction_note) {
      description = info.transaction_note;
    }
    if (!description) {
      description = isExpense ? 'PayPal Zahlung' : 'PayPal Eingang';
    }

    // Build counterparty
    let counterparty = 'PayPal';
    if (paypalTx.payer_info?.payer_name) {
      const name = paypalTx.payer_info.payer_name;
      counterparty = `${name.given_name || ''} ${name.surname || ''}`.trim();
    }
    if (!counterparty && paypalTx.payer_info?.email_address) {
      counterparty = paypalTx.payer_info.email_address;
    }

    // Categorize
    const { category, confidence } = categorizationService.categorize(
      description,
      amount
    );

    return {
      id: `paypal_${info.transaction_id}`,
      date: info.transaction_initiation_date,
      amount,
      type: isExpense ? 'expense' : 'income',
      category,
      description,
      counterparty,
      isManuallyCategized: false,
      confidence,
      sourceAccount: 'paypal',
      externalId: info.transaction_id,
    };
  }

  /**
   * Test the connection to PayPal
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.config) {
        return { success: false, message: 'PayPal API nicht konfiguriert' };
      }

      await this.getAccessToken();
      return { success: true, message: 'Verbindung erfolgreich' };
    } catch (error) {
      return {
        success: false,
        message: `Verbindung fehlgeschlagen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
      };
    }
  }
}

export const paypalApiService = new PayPalApiService();

/**
 * Example usage:
 * 
 * // Initialize with credentials
 * paypalApiService.initialize({
 *   clientId: 'YOUR_CLIENT_ID',
 *   clientSecret: 'YOUR_CLIENT_SECRET',
 *   mode: 'sandbox', // or 'live'
 * });
 * 
 * // Fetch transactions
 * const startDate = new Date('2024-01-01');
 * const transactions = await paypalApiService.fetchTransactions(startDate);
 */
