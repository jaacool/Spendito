import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, YearSummary, CategorySummary, INCOME_CATEGORIES, EXPENSE_CATEGORIES, CATEGORY_INFO } from '../types';
import { backendApiService } from './backendApi';

const TRANSACTIONS_KEY = '@spendito_transactions';

class StorageService {
  private transactions: Transaction[] = [];
  private initialized = false;

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    try {
      // Load local transactions
      const stored = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      if (stored) {
        this.transactions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
      this.transactions = [];
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
