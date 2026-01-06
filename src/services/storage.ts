import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, YearSummary, CategorySummary, INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_INFO } from '../types';
import { supabase, SUPABASE_TABLES } from './supabase';

const TRANSACTIONS_KEY = '@spendito_transactions';
const USER_ID_KEY = 'backend_user_id';

class StorageService {
  private transactions: Transaction[] = [];
  private initialized = false;

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    try {
      // 1. Load local transactions
      const stored = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (stored && !force) {
        this.transactions = JSON.parse(stored);
      }

      // 2. Try to sync with Supabase if userId exists
      const userId = await AsyncStorage.getItem(USER_ID_KEY);
      if (userId) {
        await this.syncWithSupabase(userId);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      this.transactions = [];
    }
    
    this.initialized = true;
  }

  private async syncWithSupabase(userId: string): Promise<void> {
    try {
      console.log(`[Storage] Syncing transactions from Supabase for user ${userId}...`);
      const { data, error } = await supabase
        .from(SUPABASE_TABLES.TRANSACTIONS)
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      if (data && data.length > 0) {
        // Simple merge: remote transactions win for now
        // In a real app, we'd check timestamps
        const remoteTransactions: Transaction[] = data.map(t => ({
          id: t.id,
          date: t.date,
          amount: t.amount,
          type: t.type,
          category: t.category,
          description: t.description,
          counterparty: t.counterparty,
          isManuallyCategized: t.is_manually_categorized,
          confidence: t.confidence,
          sourceAccount: t.source_account,
          externalId: t.external_id,
          isDuplicate: t.is_duplicate,
          duplicateReason: t.duplicate_reason,
          linkedTransactionId: t.linked_transaction_id,
        }));

        // Merge logic: keep local transactions that aren't on remote, 
        // and add all remote transactions
        const localOnly = this.transactions.filter(lt => 
          !remoteTransactions.some(rt => rt.id === lt.id || (rt.externalId && rt.externalId === lt.externalId))
        );

        this.transactions = [...remoteTransactions, ...localOnly];
        await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(this.transactions));
        console.log(`[Storage] Synced ${remoteTransactions.length} transactions from Supabase`);
      }
    } catch (error) {
      console.error('[Storage] Supabase sync failed:', error);
    }
  }

  private async saveTransactions(): Promise<void> {
    try {
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(this.transactions));
      
      // Sync to Supabase if userId exists
      const userId = await AsyncStorage.getItem(USER_ID_KEY);
      if (userId) {
        await this.pushToSupabase(userId, this.transactions);
      }
    } catch (error) {
      console.error('Failed to save transactions:', error);
    }
  }

  private async pushToSupabase(userId: string, transactions: Transaction[]): Promise<void> {
    try {
      const dataToSync = transactions.map(t => ({
        id: t.id,
        user_id: userId,
        date: t.date,
        amount: t.amount,
        type: t.type,
        category: t.category,
        description: t.description,
        counterparty: t.counterparty,
        is_manually_categorized: t.isManuallyCategized,
        confidence: t.confidence,
        source_account: t.sourceAccount,
        external_id: t.externalId,
        is_duplicate: t.isDuplicate || false,
        duplicate_reason: t.duplicateReason || null,
        linked_transaction_id: t.linkedTransactionId || null,
      }));

      // Upsert in batches of 100 to avoid request size limits
      const batchSize = 100;
      for (let i = 0; i < dataToSync.length; i += batchSize) {
        const batch = dataToSync.slice(i, i + batchSize);
        const { error } = await supabase
          .from(SUPABASE_TABLES.TRANSACTIONS)
          .upsert(batch);

        if (error) throw error;
      }
      console.log(`[Storage] Pushed ${dataToSync.length} transactions to Supabase`);
    } catch (error) {
      console.error('[Storage] Failed to push to Supabase:', error);
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
    
    // Calculate totals
    transactions.forEach(t => {
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
    
    return {
      year,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
      incomeByCategory: incomeSummaries.filter(s => s.count > 0),
      expenseByCategory: expenseSummaries.filter(s => s.count > 0),
    };
  }

  async clearAll(): Promise<void> {
    this.transactions = [];
    await AsyncStorage.removeItem(TRANSACTIONS_KEY);
  }

  // Import transactions from bank data
  async importTransactions(newTransactions: Transaction[]): Promise<{ added: number; duplicates: number }> {
    // Ensure we're initialized before importing
    await this.initialize();
    
    let addedCount = 0;
    let duplicateCount = 0;
    
    console.log(`[Storage] Importing ${newTransactions.length} transactions...`);
    
    for (const tx of newTransactions) {
      const isDuplicate = this.transactions.some(t => 
        t.id === tx.id || 
        (tx.externalId && t.externalId === tx.externalId) ||
        (t.date === tx.date && t.amount === tx.amount && t.description === tx.description)
      );
      
      if (!isDuplicate) {
        this.transactions.push(tx);
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
}

export const storageService = new StorageService();
