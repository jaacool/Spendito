import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, YearSummary, Category } from '../types';
import { storageService } from '../services/storage';
import { categorizationService } from '../services/categorization';
import { backupService } from '../services/backup';

interface AppContextType {
  // State
  transactions: Transaction[];
  selectedYear: number;
  availableYears: number[];
  yearSummary: YearSummary | null;
  isLoading: boolean;
  isSideMenuOpen: boolean;
  selectedCategory: Category | null;
  
  // Actions
  setSelectedYear: (year: number) => void;
  setSideMenuOpen: (open: boolean) => void;
  setSelectedCategory: (category: Category | null) => void;
  updateTransactionCategory: (id: string, category: Category) => Promise<void>;
  confirmTransaction: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  setReferenceBalance: (account: 'volksbank' | 'paypal', amount: number) => Promise<void>;
  cleanupTransactions: () => Promise<void>;
  exportDatabase: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearSummary, setYearSummary] = useState<YearSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSideMenuOpen, setSideMenuOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Initialize services and load data
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        await categorizationService.initialize();
        await storageService.initialize();
        
        // Year data is loaded by the effect below as soon as isLoading is false
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // Update data when year changes
  useEffect(() => {
    if (!isLoading) {
      updateYearData(selectedYear);
    }
  }, [selectedYear, isLoading]);

  function updateYearData(year: number) {
    // Duplicate flags are kept up to date in storage (on start and on import),
    // so the list and the totals are always based on the same data.
    setTransactions(storageService.getTransactionsByYear(year));
    setYearSummary(storageService.getYearSummary(year));
    setAvailableYears(storageService.getAvailableYears());
  }

  async function updateTransactionCategory(id: string, category: Category) {
    // Look the booking up in storage, not only in the selected year
    // (the review can work on another year than the one shown)
    const transaction = storageService.getTransactionById(id);
    if (!transaction) {
      throw new Error('Die Buchung wurde nicht gefunden. Bitte lade die Daten neu.');
    }

    // Determine the correct type based on category
    const newType: Transaction['type'] =
      category === 'transfer' ? 'transfer' : transaction.amount >= 0 ? 'income' : 'expense';

    await storageService.updateTransaction(id, {
      category,
      type: newType,
      isManuallyCategized: true,
      isUserConfirmed: true,
      confidence: 1.0,
    });

    // Learn from correction (including amount and counterparty)
    await categorizationService.learnFromCorrection(
      transaction.description,
      category,
      transaction.amount,
      transaction.counterparty
    );

    // Re-categorize all unconfirmed transactions based on updated rules
    const recategorized = categorizationService.recategorizeUnconfirmed(storageService.getAllTransactions());

    // Save re-categorized transactions (one storage write for all)
    await storageService.updateTransactions(
      recategorized.map(tx => ({
        id: tx.id,
        changes: { category: tx.category, type: tx.type, confidence: tx.confidence },
      }))
    );

    if (recategorized.length > 0) {
      console.log(`[AppContext] Re-categorized ${recategorized.length} unconfirmed transactions`);
    }

    // Refresh data
    updateYearData(selectedYear);
  }

  async function confirmTransaction(id: string) {
    const transaction = storageService.getTransactionById(id);
    if (transaction) {
      await storageService.updateTransaction(id, {
        isUserConfirmed: true,
        confidence: 1.0,
      });
      
      // Learn from confirmation - reinforce the current categorization
      await categorizationService.learnFromCorrection(
        transaction.description, 
        transaction.category, 
        transaction.amount,
        transaction.counterparty
      );
      
      // Refresh data
      updateYearData(selectedYear);
    }
  }

  // Reloads data in the background. Deliberately does NOT set isLoading:
  // the home screen would unmount and close open modals (e.g. the CSV import
  // result in SettingsModal would get lost).
  async function refreshData() {
    await categorizationService.initialize(true);
    await storageService.initialize(true);
    updateYearData(selectedYear);
  }

  async function setReferenceBalance(account: 'volksbank' | 'paypal', amount: number) {
    const today = new Date().toISOString();
    await storageService.setReferenceBalance(account, amount, today);
    updateYearData(selectedYear);
  }

  async function cleanupTransactions() {
    const count = await storageService.cleanupWronglyAssignedTransactions();
    if (count > 0) {
      updateYearData(selectedYear);
    }
  }

  // Raw export of all bookings (for support). Works in the browser and on the
  // phone (share sheet) - it used document/Blob only and crashed on the phone.
  async function exportDatabase() {
    const data = storageService.getTransactions();
    await backupService.saveFile(
      JSON.stringify(data, null, 2),
      `spendito_db_export_${new Date().toISOString().split('T')[0]}.json`,
      'application/json'
    );
  }

  return (
    <AppContext.Provider
      value={{
        transactions,
        selectedYear,
        availableYears,
        yearSummary,
        isLoading,
        isSideMenuOpen,
        selectedCategory,
        setSelectedYear,
        setSideMenuOpen,
        setSelectedCategory,
        updateTransactionCategory,
        confirmTransaction,
        refreshData,
        setReferenceBalance,
        cleanupTransactions,
        exportDatabase,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
