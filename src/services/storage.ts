import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, YearSummary, CategorySummary, INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_INFO, SourceAccount, ReferenceBalance, AccountYearSummary } from '../types';
import { backendApiService } from './backendApi';
import { categorizationService } from './categorization';
import { duplicateDetectionService } from './duplicateDetection';
import { isCountedInTotals } from './transactionFilters';
import { repairStoredTransactions, applyRestoredDescriptions } from './dataRepair';

const TRANSACTIONS_KEY = '@spendito_transactions';
const REFERENCE_BALANCES_KEY = '@spendito_reference_balances';
// Unreadable transaction data is parked here instead of being overwritten
const TRANSACTIONS_CORRUPT_BACKUP_KEY = 'spendito_transactions_corrupt_backup';

/**
 * Which account does a stored booking belong to?
 * PayPal: marked by the PayPal proxy, or an external ID that is neither a bank CSV
 * ID ("bank_...") nor belongs to a booking with a UUID id (old bank imports).
 * Used on start AND by the cleanup in the settings - two different rules used to
 * move the same bookings back and forth between the accounts.
 */
function detectSourceAccount(t: Transaction): SourceAccount {
  const raw = t as any;
  const isPayPal =
    raw.bank_id === 'paypal' ||
    raw.account_number === 'paypal' ||
    (!!t.externalId && !t.externalId.startsWith('bank_') && !t.id.includes('-'));
  return isPayPal ? 'paypal' : 'volksbank';
}

function assignSourceAccounts(transactions: Transaction[]): { transactions: Transaction[]; changed: number } {
  let changed = 0;
  const updated = transactions.map(t => {
    const account = detectSourceAccount(t);
    if (t.sourceAccount === account) return t;
    changed++;
    return { ...t, sourceAccount: account };
  });
  return { transactions: updated, changed };
}

class StorageService {
  private transactions: Transaction[] = [];
  private referenceBalances: Record<SourceAccount, ReferenceBalance | null> = {
    volksbank: null,
    paypal: null,
  };
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    // Parallel calls share one load (otherwise two loads could overwrite each other)
    if (!this.initPromise) {
      this.initPromise = this.load().finally(() => {
        this.initPromise = null;
      });
    }
    await this.initPromise;
  }

  private async load(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (stored) {
        let loadedTransactions: Transaction[] | null = null;
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) loadedTransactions = parsed;
        } catch {
          loadedTransactions = null;
        }

        if (!loadedTransactions) {
          // Never lose data silently: park the unreadable data before anything is saved
          console.error('[Storage] Stored transactions unreadable - backup kept');
          await AsyncStorage.setItem(TRANSACTIONS_CORRUPT_BACKUP_KEY, stored);
          loadedTransactions = [];
        }

        // Make sure every booking sits on the right account (Volksbank / PayPal)
        const { transactions: assigned, changed: accountsChanged } = assignSourceAccounts(loadedTransactions);

        // Repair bookings damaged by the old duplicate detection and make sure
        // stored duplicate flags match the current detection rules.
        await categorizationService.initialize();
        const repair = repairStoredTransactions(assigned);
        this.transactions = repair.transactions;
        if (repair.repairedCount > 0) {
          console.log(`[Storage] Repaired ${repair.repairedCount} bank bookings wrongly marked as duplicate`);
        }

        if (accountsChanged || repair.changed) {
          await this.saveTransactions();
        }
      } else {
        this.transactions = [];
      }

      // Load reference balances
      const storedBalances = await AsyncStorage.getItem(REFERENCE_BALANCES_KEY);
      if (storedBalances) {
        try {
          this.referenceBalances = { volksbank: null, paypal: null, ...JSON.parse(storedBalances) };
        } catch {
          console.error('[Storage] Stored reference balances unreadable');
        }
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

  /**
   * Update many bookings and write the storage only once
   * (one write per booking was very slow for large data sets).
   */
  async updateTransactions(updates: { id: string; changes: Partial<Transaction> }[]): Promise<void> {
    if (updates.length === 0) return;
    const byId = new Map(updates.map(u => [u.id, u.changes]));
    this.transactions = this.transactions.map(t => {
      const changes = byId.get(t.id);
      return changes ? { ...t, ...changes } : t;
    });
    await this.saveTransactions();
  }

  getTransactionById(id: string): Transaction | undefined {
    return this.transactions.find(t => t.id === id);
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
      if (!isCountedInTotals(t)) {
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
    
    // Get ALL transactions for this account. Duplicate/transfer flags only matter for
    // income/expense totals - a bank->PayPal transfer still changes the bank balance.
    const accountTx = this.transactions.filter(t => t.sourceAccount === account);

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

    // Year boundaries in local time - the same rule getTransactionsByYear uses
    // (UTC boundaries put a booking at 31.12. 23:30 UTC into two different years)
    const startOfYear = new Date(year, 0, 1, 0, 0, 0, 0).toISOString();
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999).toISOString();

    const startBalance = this.getBalanceAtDate(account, startOfYear);
    const endBalance = this.getBalanceAtDate(account, endOfYear);

    return {
      account,
      startBalance,
      endBalance,
      change: endBalance - startBalance
    };
  }

  getUniqueTransactions(): Transaction[] {
    return this.transactions.filter(t => !t.isDuplicate);
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

      // With an external ID that ID alone decides. Comparing date+amount+text would
      // drop real bookings that look identical (e.g. two equal membership fees).
      const isDuplicate = this.transactions.some(t => 
        t.id === tx.id || 
        (tx.externalId
          ? t.externalId === tx.externalId
          : t.date === tx.date && t.amount === tx.amount && t.description === tx.description && t.sourceAccount === sourceAccount)
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
            isGuthabenTransfer: rawTx.isGuthabenTransfer || false,
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
      // After importing, automatically run duplicate detection to link accounts
      this.transactions = duplicateDetectionService.markDuplicates(this.transactions);
      await this.saveTransactions();
    }
    
    return { added: addedCount, duplicates: duplicateCount };
  }

  /**
   * Put original bank texts back (from a CSV re-import) into bookings whose
   * text was overwritten by an older app version. Returns the number restored.
   */
  async restoreDescriptions(restored: { externalId: string; description: string }[]): Promise<number> {
    await this.initialize();
    const result = applyRestoredDescriptions(this.transactions, restored);
    if (result.restoredCount > 0) {
      this.transactions = result.transactions;
      await this.saveTransactions();
    }
    return result.restoredCount;
  }

  /**
   * FIX: Clean up wrongly assigned transactions
   * Moves PayPal transactions that were wrongly marked as 'volksbank' to 'paypal'
   */
  async cleanupWronglyAssignedTransactions(): Promise<number> {
    const { transactions, changed } = assignSourceAccounts(this.transactions);
    if (changed > 0) {
      this.transactions = transactions;
      await this.saveTransactions();
      console.log(`[Storage] Moved ${changed} bookings to the correct account`);
    }
    return changed;
  }

}

export const storageService = new StorageService();
