import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, YearSummary, Category } from '../types';
import { storageService } from '../services/storage';
import { categorizationService } from '../services/categorization';
import { duplicateDetectionService } from '../services/duplicateDetection';
import { generateMockData } from '../services/mockData';

interface AppContextType {
  // State
  transactions: Transaction[];
  selectedYear: number;
  availableYears: number[];
  yearSummary: YearSummary | null;
  isLoading: boolean;
  isSideMenuOpen: boolean;
  
  // Actions
  setSelectedYear: (year: number) => void;
  setSideMenuOpen: (open: boolean) => void;
  updateTransactionCategory: (id: string, category: Category) => Promise<void>;
  confirmTransaction: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  loadMockData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearSummary, setYearSummary] = useState<YearSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSideMenuOpen, setSideMenuOpen] = useState(false);

  // Initialize services and load data
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        await categorizationService.initialize();
        await storageService.initialize();
        
        const years = storageService.getAvailableYears();
        if (years.length > 0) {
          setAvailableYears(years);
          updateYearData(selectedYear);
        }
        // No mock data - start with empty state
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
    let yearTransactions = storageService.getTransactionsByYear(year);
    
    // Apply duplicate detection to link PayPal Guthaben-Transfers with real payments
    yearTransactions = duplicateDetectionService.linkGuthabenTransfersToPayments(yearTransactions);
    
    setTransactions(yearTransactions);
    setYearSummary(storageService.getYearSummary(year));
    setAvailableYears(storageService.getAvailableYears());
  }

  async function loadMockDataInternal() {
    const mockTransactions = await generateMockData();
    await storageService.importTransactions(mockTransactions);
    const years = storageService.getAvailableYears();
    setAvailableYears(years);
    if (years.length > 0) {
      setSelectedYear(years[0]);
      updateYearData(years[0]);
    }
  }

  async function updateTransactionCategory(id: string, category: Category) {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      // Determine the correct type based on category
      let newType: 'income' | 'expense' | 'transfer' = transaction.type;
      if (category === 'transfer') {
        newType = 'transfer';
      } else if (transaction.amount >= 0) {
        newType = 'income';
      } else {
        newType = 'expense';
      }
      
      await storageService.updateTransaction(id, {
        category,
        type: newType,
        isManuallyCategized: true,
        isUserConfirmed: true,
        confidence: 1.0,
      });
      
      // Learn from correction (including amount)
      await categorizationService.learnFromCorrection(
        transaction.description, 
        category, 
        transaction.amount
      );
      
      // Re-categorize all unconfirmed transactions based on updated rules
      const allTransactions = storageService.getAllTransactions();
      const recategorized = categorizationService.recategorizeUnconfirmed(allTransactions);
      
      // Save re-categorized transactions
      for (const tx of recategorized) {
        await storageService.updateTransaction(tx.id, {
          category: tx.category,
          type: tx.type,
          confidence: tx.confidence,
        });
      }
      
      if (recategorized.length > 0) {
        console.log(`[AppContext] Re-categorized ${recategorized.length} unconfirmed transactions`);
      }
      
      // Refresh data
      updateYearData(selectedYear);
    }
  }

  async function confirmTransaction(id: string) {
    const transaction = transactions.find(t => t.id === id);
    if (transaction) {
      await storageService.updateTransaction(id, {
        isUserConfirmed: true,
        confidence: 1.0,
      });
      
      // Learn from confirmation - reinforce the current categorization
      await categorizationService.learnFromCorrection(
        transaction.description, 
        transaction.category, 
        transaction.amount
      );
      
      // Refresh data
      updateYearData(selectedYear);
    }
  }

  async function refreshData() {
    setIsLoading(true);
    try {
      await categorizationService.initialize(true);
      await storageService.initialize(true);
      updateYearData(selectedYear);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadMockData() {
    setIsLoading(true);
    try {
      await storageService.clearAll();
      await loadMockDataInternal();
    } finally {
      setIsLoading(false);
    }
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
        setSelectedYear,
        setSideMenuOpen,
        updateTransactionCategory,
        confirmTransaction,
        refreshData,
        loadMockData,
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
