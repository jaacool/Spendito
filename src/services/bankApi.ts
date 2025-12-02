/**
 * Bank API Service - Sparkassen Integration
 * 
 * This service prepares the integration with Sparkassen accounts via FinTS/HBCI.
 * Currently uses mock data, but the interface is ready for real bank connection.
 * 
 * For production use, you'll need:
 * 1. FinTS/HBCI credentials from your Sparkasse
 * 2. A backend server to handle the secure bank communication
 * 3. Proper authentication and encryption
 */

import { Transaction, Category } from '../types';
import { categorizationService } from './categorization';

export interface BankAccount {
  iban: string;
  bic: string;
  bankName: string;
  accountHolder: string;
  balance: number;
  lastSync: string;
}

export interface RawBankTransaction {
  date: string;
  valueDate: string;
  amount: number;
  currency: string;
  counterpartyName: string;
  counterpartyIban?: string;
  purpose: string; // Verwendungszweck
  bookingText: string;
  reference?: string;
}

interface BankApiConfig {
  bankCode: string; // BLZ
  userId: string;
  pin: string;
  endpoint?: string;
}

class BankApiService {
  private config: BankApiConfig | null = null;
  private isConnected = false;

  /**
   * Configure the bank connection
   * In production, this would set up FinTS/HBCI connection parameters
   */
  configure(config: BankApiConfig): void {
    this.config = config;
    console.log('Bank API configured for BLZ:', config.bankCode);
  }

  /**
   * Test the bank connection
   * In production, this would attempt a FinTS handshake
   */
  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Bank API not configured. Call configure() first.');
    }

    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In production: Perform FinTS dialog initialization
    // const fints = new FinTS(this.config);
    // return await fints.testConnection();
    
    this.isConnected = true;
    return true;
  }

  /**
   * Fetch account information
   */
  async getAccountInfo(): Promise<BankAccount> {
    if (!this.isConnected) {
      throw new Error('Not connected to bank. Call testConnection() first.');
    }

    // Mock account data
    return {
      iban: 'DE89 3704 0044 0532 0130 00',
      bic: 'COBADEFFXXX',
      bankName: 'Sparkasse Beispielstadt',
      accountHolder: 'Hunde-Rettungsverein e.V.',
      balance: 15234.56,
      lastSync: new Date().toISOString(),
    };
  }

  /**
   * Fetch transactions from the bank
   * @param fromDate Start date for transaction fetch
   * @param toDate End date for transaction fetch
   */
  async fetchTransactions(fromDate: Date, toDate: Date): Promise<RawBankTransaction[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to bank. Call testConnection() first.');
    }

    // In production, this would use FinTS MT940 or CAMT format
    // const fints = new FinTS(this.config);
    // const statements = await fints.getStatements(fromDate, toDate);
    // return this.parseStatements(statements);

    // Return empty array - mock data is generated separately
    console.log(`Would fetch transactions from ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    return [];
  }

  /**
   * Convert raw bank transactions to app transactions with auto-categorization
   */
  async processTransactions(rawTransactions: RawBankTransaction[]): Promise<Transaction[]> {
    await categorizationService.initialize();

    return rawTransactions.map((raw, index) => {
      const isExpense = raw.amount < 0;
      const { category, confidence } = categorizationService.categorize(raw.purpose, raw.amount);

      return {
        id: `bank_${Date.now()}_${index}`,
        date: raw.date,
        amount: raw.amount,
        type: isExpense ? 'expense' : 'income',
        category,
        description: raw.purpose || raw.bookingText,
        counterparty: raw.counterpartyName,
        isManuallyCategized: false,
        confidence,
        rawData: JSON.stringify(raw),
      };
    });
  }

  /**
   * Disconnect from bank
   */
  disconnect(): void {
    this.isConnected = false;
    this.config = null;
  }

  /**
   * Check if connected
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

export const bankApiService = new BankApiService();

/**
 * FinTS/HBCI Integration Notes:
 * 
 * For real Sparkassen integration, you would need:
 * 
 * 1. Install a FinTS library:
 *    npm install nodejs-fints
 *    or use a backend service
 * 
 * 2. Get your bank's FinTS endpoint:
 *    - Sparkasse endpoints are listed at: https://www.hbci-zka.de/institute/institut_select.htm
 *    - Example: https://banking-be1.s-fints-pt-be.de/fints30
 * 
 * 3. Authentication:
 *    - BLZ (Bankleitzahl): Your Sparkasse's routing number
 *    - User ID: Usually your account number or online banking ID
 *    - PIN: Your online banking PIN
 * 
 * 4. Security considerations:
 *    - Never store PIN in the app
 *    - Use secure storage for credentials
 *    - Implement proper TAN handling for transactions
 *    - Consider using a backend proxy for additional security
 * 
 * 5. Transaction formats:
 *    - MT940: Legacy format, widely supported
 *    - CAMT.052/053/054: Modern XML-based formats
 * 
 * Example FinTS usage (pseudo-code):
 * 
 * const FinTS = require('nodejs-fints');
 * 
 * const client = new FinTS({
 *   blz: '12345678',
 *   url: 'https://banking.sparkasse.de/fints30',
 *   user: 'username',
 *   pin: 'pin',
 * });
 * 
 * const accounts = await client.getAccounts();
 * const statements = await client.getStatements(account, fromDate, toDate);
 */
