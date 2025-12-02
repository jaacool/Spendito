/**
 * GoCardless Bank Account Data API Integration
 * 
 * This service provides integration with GoCardless (formerly nordigen) 
 * to fetch bank transactions from German banks like Volksbank.
 * 
 * SETUP REQUIRED:
 * 1. Register at: https://bankaccountdata.gocardless.com/
 * 2. Create API Keys (Secret ID + Secret Key)
 * 3. Store credentials securely
 */

import { Transaction } from '../types';
import { categorizationService } from './categorization';

// GoCardless API Configuration
interface GoCardlessConfig {
  secretId: string;
  secretKey: string;
}

// API Response Types
interface GoCardlessToken {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

interface Institution {
  id: string;
  name: string;
  bic: string;
  logo: string;
  countries: string[];
}

interface Requisition {
  id: string;
  status: string;
  link: string;
  accounts: string[];
  reference: string;
}

interface BankAccount {
  id: string;
  iban: string;
  institution_id: string;
  status: string;
}

interface BankTransaction {
  transactionId: string;
  bookingDate: string;
  valueDate: string;
  transactionAmount: {
    amount: string;
    currency: string;
  };
  creditorName?: string;
  creditorAccount?: { iban: string };
  debtorName?: string;
  debtorAccount?: { iban: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  bankTransactionCode?: string;
}

interface TransactionsResponse {
  transactions: {
    booked: BankTransaction[];
    pending: BankTransaction[];
  };
}

class GoCardlessApiService {
  private config: GoCardlessConfig | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  private readonly BASE_URL = 'https://bankaccountdata.gocardless.com/api/v2';

  /**
   * Initialize with API credentials
   */
  initialize(config: GoCardlessConfig): void {
    this.config = config;
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get access token (with auto-refresh)
   */
  private async getAccessToken(): Promise<string> {
    if (!this.config) throw new Error('GoCardless API not configured');

    // Check if token is still valid
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Try to refresh if we have a refresh token
    if (this.refreshToken) {
      try {
        const response = await fetch(`${this.BASE_URL}/token/refresh/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh: this.refreshToken }),
        });

        if (response.ok) {
          const data = await response.json();
          this.accessToken = data.access;
          this.tokenExpiry = new Date(Date.now() + data.access_expires * 1000);
          return this.accessToken!;
        }
      } catch (e) {
        // Refresh failed, get new token
      }
    }

    // Get new token
    const response = await fetch(`${this.BASE_URL}/token/new/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_id: this.config.secretId,
        secret_key: this.config.secretKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.status}`);
    }

    const data: GoCardlessToken = await response.json();
    this.accessToken = data.access;
    this.refreshToken = data.refresh;
    this.tokenExpiry = new Date(Date.now() + data.access_expires * 1000);

    return this.accessToken;
  }

  /**
   * Get list of available German banks
   */
  async getGermanBanks(): Promise<Institution[]> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.BASE_URL}/institutions/?country=de`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch institutions: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Search for a specific bank (e.g., Volksbank)
   */
  async searchBank(query: string): Promise<Institution[]> {
    const banks = await this.getGermanBanks();
    const lowerQuery = query.toLowerCase();
    return banks.filter(
      (bank) =>
        bank.name.toLowerCase().includes(lowerQuery) ||
        bank.bic.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Create a bank connection (requisition)
   * Returns a link for the user to authenticate with their bank
   */
  async createBankConnection(
    institutionId: string,
    redirectUrl: string,
    reference: string
  ): Promise<{ id: string; link: string }> {
    const token = await this.getAccessToken();

    // First create an end-user agreement
    const agreementResponse = await fetch(`${this.BASE_URL}/agreements/enduser/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        institution_id: institutionId,
        max_historical_days: 730, // 2 years
        access_valid_for_days: 90,
        access_scope: ['balances', 'details', 'transactions'],
      }),
    });

    if (!agreementResponse.ok) {
      throw new Error(`Failed to create agreement: ${agreementResponse.status}`);
    }

    const agreement = await agreementResponse.json();

    // Then create the requisition
    const requisitionResponse = await fetch(`${this.BASE_URL}/requisitions/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        redirect: redirectUrl,
        institution_id: institutionId,
        reference: reference,
        agreement: agreement.id,
        user_language: 'DE',
      }),
    });

    if (!requisitionResponse.ok) {
      throw new Error(`Failed to create requisition: ${requisitionResponse.status}`);
    }

    const requisition: Requisition = await requisitionResponse.json();
    return { id: requisition.id, link: requisition.link };
  }

  /**
   * Get requisition status and linked accounts
   */
  async getRequisitionStatus(requisitionId: string): Promise<Requisition> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.BASE_URL}/requisitions/${requisitionId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get requisition: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get account details
   */
  async getAccountDetails(accountId: string): Promise<BankAccount> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.BASE_URL}/accounts/${accountId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get account: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Fetch transactions from a connected bank account
   */
  async fetchTransactions(
    accountId: string,
    dateFrom?: string,
    dateTo?: string
  ): Promise<Transaction[]> {
    const token = await this.getAccessToken();
    await categorizationService.initialize();

    let url = `${this.BASE_URL}/accounts/${accountId}/transactions/`;
    const params = new URLSearchParams();
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status}`);
    }

    const data: TransactionsResponse = await response.json();
    const transactions: Transaction[] = [];

    // Process booked transactions
    for (const tx of data.transactions.booked) {
      const converted = this.convertTransaction(tx);
      if (converted) {
        transactions.push(converted);
      }
    }

    return transactions;
  }

  /**
   * Convert GoCardless transaction to internal format
   */
  private convertTransaction(tx: BankTransaction): Transaction | null {
    const amount = parseFloat(tx.transactionAmount.amount);
    if (isNaN(amount) || amount === 0) return null;

    const isIncome = amount > 0;
    const counterparty = isIncome
      ? tx.debtorName || 'Unbekannt'
      : tx.creditorName || 'Unbekannt';

    // Build description from available fields
    const description =
      tx.remittanceInformationUnstructured ||
      tx.remittanceInformationUnstructuredArray?.join(' ') ||
      counterparty;

    const { category, confidence } = categorizationService.categorize(
      description,
      amount
    );

    return {
      id: `gc_${tx.transactionId}`,
      date: new Date(tx.bookingDate).toISOString(),
      amount: amount,
      type: isIncome ? 'income' : 'expense',
      category,
      description,
      counterparty,
      isManuallyCategized: false,
      confidence,
      sourceAccount: 'volksbank',
      externalId: tx.transactionId,
    };
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: string): Promise<{ amount: string; currency: string }> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.BASE_URL}/accounts/${accountId}/balances/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get balance: ${response.status}`);
    }

    const data = await response.json();
    const balance = data.balances?.[0];
    
    return {
      amount: balance?.balanceAmount?.amount || '0',
      currency: balance?.balanceAmount?.currency || 'EUR',
    };
  }
}

export const gocardlessApiService = new GoCardlessApiService();
