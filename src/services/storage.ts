import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, YearSummary, CategorySummary, INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_INFO, SourceAccount, ReferenceBalance, AccountYearSummary } from '../types';
import { backendApiService } from './backendApi';
import { categorizationService } from './categorization';

const TRANSACTIONS_KEY = '@spendito_transactions';
const REFERENCE_BALANCES_KEY = '@spendito_reference_balances';

class StorageService {
  private transactions: Transaction[] = [];
  private referenceBalances: Record<SourceAccount, ReferenceBalance | null> = {
    volksbank: null,
    paypal: null,
  };
  private initialized = false;

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    try {
      // Load local transactions
      const stored = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (stored) {
        this.transactions = JSON.parse(stored);
      }

      // Load reference balances
      const storedBalances = await AsyncStorage.getItem(REFERENCE_BALANCES_KEY);
      if (storedBalances) {
        this.referenceBalances = JSON.parse(storedBalances);
      }
    } catch (error) {
      console.error('Failed to load storage data:', error);
    }
    
    this.initialized = true;
  }

  private async saveTransactions(): Promise<void> {
    try {
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(this.transactions));
    } catch (error) {
      console.error('Failed to save transactions:', error);
    }
  }

  async addTransaction(transaction: Transaction): Promise<void> {
    this.transactions.push(transaction);
    await this.saveTransactions();
  }

  async addTransactions(transactions: Transaction[]): Promise<void> {
    this.transactions.push(...transactions);
    await this.saveTransactions();
  }

  getAllTransactions(): Transaction[] {
    return [...this.transactions];
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      this.transactions[index] = { ...this.transactions[index], ...updates };
      await this.saveTransactions();
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    this.transactions = this.transactions.filter(t => t.id !== id);
    await this.saveTransactions();
  }

  getTransactions(): Transaction[] {
    return [...this.transactions];
  }

  getTransactionsByYear(year: number): Transaction[] {
    return this.transactions.filter(t => {
      const transactionYear = new Date(t.date).getFullYear();
      return transactionYear === year;
    });
  }

  getAvailableYears(): number[] {
    const years = new Set<number>();
    
    // Always include current year
    years.add(new Date().getFullYear());
    
    // Add years from transactions
    this.transactions.forEach(t => {
      years.add(new Date(t.date).getFullYear());
    });
    
    return Array.from(years).sort((a, b) => b - a); // Newest first
  }

  getYearSummary(year: number): YearSummary {
    const transactions = this.getTransactionsByYear(year);
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    const incomeByCategory: Record<string, { total: number; count: number }> = {};
    const expenseByCategory: Record<string, { total: number; count: number }> = {};
    
    // Initialize categories
    INCOME_CATEGORIES.forEach(cat => {
      incomeByCategory[cat] = { total: 0, count: 0 };
    });
    EXPENSE_CATEGORIES.forEach(cat => {
      expenseByCategory[cat] = { total: 0, count: 0 };
    });
    
    // Calculate totals (exclude transfers and duplicates from statistics)
    transactions.forEach(t => {
      // Skip transfers and duplicates - they don't count as income or expense
      if (t.category === 'transfer' || t.type === 'transfer' || t.isDuplicate) {
        return;
      }
      
      if (t.type === 'income') {
        totalIncome += t.amount;
        if (incomeByCategory[t.category]) {
          incomeByCategory[t.category].total += t.amount;
          incomeByCategory[t.category].count++;
        }
      } else {
        totalExpense += Math.abs(t.amount);
        if (expenseByCategory[t.category]) {
          expenseByCategory[t.category].total += Math.abs(t.amount);
          expenseByCategory[t.category].count++;
        }
      }
    });
    
    // Convert to CategorySummary arrays
    const incomeSummaries: CategorySummary[] = INCOME_CATEGORIES.map(cat => ({
      category: cat,
      total: incomeByCategory[cat].total,
      count: incomeByCategory[cat].count,
      percentage: totalIncome > 0 ? (incomeByCategory[cat].total / totalIncome) * 100 : 0,
    }));
    
    const expenseSummaries: CategorySummary[] = EXPENSE_CATEGORIES.map(cat => ({
      category: cat,
      total: expenseByCategory[cat].total,
      count: expenseByCategory[cat].count,
      percentage: totalExpense > 0 ? (expenseByCategory[cat].total / totalExpense) * 100 : 0,
    }));
    
    // Calculate Account Summaries
    const accountSummaries: AccountYearSummary[] = [];
    const volksbankSummary = this.getAccountYearSummary(year, 'volksbank');
    const paypalSummary = this.getAccountYearSummary(year, 'paypal');
    
    if (volksbankSummary) accountSummaries.push(volksbankSummary);
    if (paypalSummary) accountSummaries.push(paypalSummary);

    return {
      year,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      incomeByCategory: incomeSummaries.filter(s => s.count > 0),
      expenseByCategory: expenseSummaries.filter(s => s.count > 0),
      accountSummaries: accountSummaries.length > 0 ? accountSummaries : undefined,
    };
  }

  async clearAll(): Promise<void> {
    this.transactions = [];
    this.referenceBalances = { volksbank: null, paypal: null };
    await AsyncStorage.multiRemove([TRANSACTIONS_KEY, REFERENCE_BALANCES_KEY]);
  }

  // --- Reference Balance Logic ---

  async setReferenceBalance(account: SourceAccount, amount: number, date: string): Promise<void> {
    this.referenceBalances[account] = { amount, date };
    await AsyncStorage.setItem(REFERENCE_BALANCES_KEY, JSON.stringify(this.referenceBalances));
  }

  getReferenceBalance(account: SourceAccount): ReferenceBalance | null {
    return this.referenceBalances[account];
  }

  /**
   * Calculates the balance of an account at a specific date.
   * Logic: Start from reference balance, add/subtract transactions between dates.
   */
  getBalanceAtDate(account: SourceAccount, targetDateStr: string): number {
    const ref = this.referenceBalances[account];
    if (!ref) return 0;

    const targetDate = new Date(targetDateStr);
    const refDate = new Date(ref.date);
    
    // Get all transactions for this account
    const accountTx = this.transactions.filter(t => t.sourceAccount === account && !t.isDuplicate);

    let calculatedBalance = ref.amount;

    if (targetDate < refDate) {
      // Target is in the past: subtract transactions between target and ref
      const txBetween = accountTx.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= targetDate && txDate < refDate;
      });
      
      txBetween.forEach(t => {
        calculatedBalance -= t.amount;
      });
    } else if (targetDate > refDate) {
      // Target is in the future: add transactions between ref and target
      const txBetween = accountTx.filter(t => {
        const txDate = new Date(t.date);
        return txDate > refDate && txDate <= targetDate;
      });
      
      txBetween.forEach(t => {
        calculatedBalance += t.amount;
      });
    }

    return calculatedBalance;
  }

  getAccountYearSummary(year: number, account: SourceAccount): AccountYearSummary | null {
    const ref = this.referenceBalances[account];
    if (!ref) return null;

    // Dates for the year
    const startOfYear = `${year}-01-01T00:00:00.000Z`;
    const endOfYear = `${year}-12-31T23:59:59.999Z`;

    const startBalance = this.getBalanceAtDate(account, startOfYear);
    const endBalance = this.getBalanceAtDate(account, endOfYear);

    return {
      account,
      startBalance,
      endBalance,
      change: endBalance - startBalance
    };
  }

  // Import transactions from bank data
  async importTransactions(newTransactions: Transaction[]): Promise<{ added: number; duplicates: number }> {
    // Ensure we're initialized before importing
    await this.initialize();
    
    let addedCount = 0;
    let duplicateCount = 0;
    
    console.log(`[Storage] Importing ${newTransactions.length} transactions...`);
    
    for (const tx of newTransactions) {
      // FIX: Check if the transaction already has a sourceAccount or bank_id/account_number
      // This is crucial for PayPal transactions coming from the API
      let sourceAccount: SourceAccount = (tx.sourceAccount as SourceAccount) || 'volksbank'; 
      
      // Handle different formats from different sources (like raw objects from backend API)
      const rawTx = tx as any;
      if (rawTx.bank_id === 'paypal' || rawTx.account_number === 'paypal') {
        sourceAccount = 'paypal';
      }

      const isDuplicate = this.transactions.some(t => 
        t.id === tx.id || 
        (tx.externalId && t.externalId === tx.externalId) ||
        (t.date === tx.date && t.amount === tx.amount && t.description === tx.description && t.sourceAccount === sourceAccount)
      );
      
      if (!isDuplicate) {
        // Ensure the transaction has the correct sourceAccount and required fields before saving
        // Convert raw backend transaction to app Transaction if needed
        let finalTx: Transaction;
        
        if (rawTx.bank_id === 'paypal' || rawTx.account_number === 'paypal') {
          // It's a raw PayPal transaction from proxy
          const isIncome = tx.amount > 0;
          const { category, confidence } = categorizationService.categorize(
            tx.description || tx.counterparty || '', 
            tx.amount,
            tx.counterparty
          );

          let txType: 'income' | 'expense' | 'transfer' = isIncome ? 'income' : 'expense';
          if (category === 'transfer') txType = 'transfer';

          finalTx = {
            id: tx.id || `pp_${Date.now()}_${Math.random()}`,
            date: tx.date,
            amount: tx.amount,
            type: txType,
            category,
            description: tx.description || 'PayPal Transaktion',
            counterparty: tx.counterparty || 'PayPal',
            isManuallyCategized: false,
            confidence,
            sourceAccount: 'paypal',
            externalId: tx.externalId || tx.id,
          };
        } else {
          finalTx = { ...tx, sourceAccount };
        }

        this.transactions.push(finalTx);
        addedCount++;
      } else {
        duplicateCount++;
      }
    }
    
    if (addedCount > 0) {
      await this.saveTransactions();
    }
    
    return { added: addedCount, duplicates: duplicateCount };
  }

  /**
   * FIX: Clean up wrongly assigned transactions
   * Moves PayPal transactions that were wrongly marked as 'volksbank' to 'paypal'
   */
  async cleanupWronglyAssignedTransactions(): Promise<number> {
    let fixCount = 0;
    this.transactions = this.transactions.map(t => {
      // Detection: If source is volksbank but description/booking_text indicates PayPal API source
      const rawT = t as any;
      if (t.sourceAccount === 'volksbank' && 
          (rawT.bank_id === 'paypal' || rawT.account_number === 'paypal' || t.description.startsWith('PayPal: T'))) {
        fixCount++;
        return { ...t, sourceAccount: 'paypal' as SourceAccount };
      }
      return t;
    });

    if (fixCount > 0) {
      await this.saveTransactions();
      console.log(`[Storage] Cleaned up ${fixCount} wrongly assigned PayPal transactions`);
    }
    return fixCount;
  }
}

export const storageService = new StorageService();
