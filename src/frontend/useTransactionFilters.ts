// File: src/frontend/useTransactionFilters.ts
import { useMemo, useState } from 'react';
import { Category, Transaction } from '../types';
import {
  AccountFilter,
  TypeFilter,
  filterTransactions,
} from '../services/transactionFilters';

/**
 * Filter state of the booking list (tabs, account, search, toggles) and the
 * memoized result. Filtering used to run on every render, i.e. on every
 * keystroke for the whole list.
 */
export function useTransactionFilters(transactions: Transaction[], selectedCategory: Category | null) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, {
      category: selectedCategory,
      type: typeFilter,
      account: accountFilter,
      showDuplicates,
      showOnlyOpen,
      searchQuery,
    }),
    [transactions, selectedCategory, typeFilter, accountFilter, showDuplicates, showOnlyOpen, searchQuery]
  );

  const { duplicateCount, openCount } = useMemo(() => ({
    duplicateCount: transactions.filter(t => t.isDuplicate).length,
    openCount: transactions.filter(t => !t.isUserConfirmed && !t.isManuallyCategized && !t.isDuplicate).length,
  }), [transactions]);

  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
  };

  return {
    filteredTransactions,
    duplicateCount,
    openCount,
    typeFilter,
    setTypeFilter,
    accountFilter,
    setAccountFilter,
    showDuplicates,
    toggleDuplicates: () => setShowDuplicates(v => !v),
    showOnlyOpen,
    toggleOnlyOpen: () => setShowOnlyOpen(v => !v),
    searchQuery,
    setSearchQuery,
    showSearch,
    openSearch: () => setShowSearch(true),
    closeSearch,
  };
}
