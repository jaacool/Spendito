// File: src/services/transactionFilters.ts
import { Transaction, CATEGORY_INFO, Category, SourceAccount } from '../types';

/**
 * Single source of truth: does a booking count as income/expense in totals,
 * the Finanzamt export and its preview? Transfers between own accounts and
 * duplicates (same money seen on bank AND PayPal) never count.
 */
export function isCountedInTotals(t: Transaction): boolean {
  return (
    !t.isDuplicate &&
    !t.isGuthabenTransfer &&
    t.type !== 'transfer' &&
    t.category !== 'transfer'
  );
}

/**
 * German label of a category, robust against unknown values from old data.
 */
export function getCategoryLabel(category: Category | string): string {
  return CATEGORY_INFO[category as Category]?.labelDe ?? 'Unbekannt';
}

export type TypeFilter = 'all' | 'income' | 'expense';
export type AccountFilter = 'all' | SourceAccount;

export interface TransactionListFilters {
  category: Category | null;
  type: TypeFilter;
  account: AccountFilter;
  showDuplicates: boolean;
  showOnlyOpen: boolean;
  searchQuery: string;
}

// German amount without currency, e.g. 1500 -> "1500,00" (for amount search)
function amountSearchText(amount: number): string {
  return Math.abs(amount).toFixed(2).replace('.', ',');
}

/**
 * Search in text AND amount. "500" finds 500,00 € but not 1.500,00 €,
 * "12,5" finds 12,50 €, "Rechnung 123" searches the text.
 */
export function matchesSearch(t: Transaction, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const text = `${t.description || ''} ${t.counterparty || ''}`.toLowerCase();
  if (text.includes(query)) return true;

  const amountQuery = query.replace(/\./g, '').replace(/\s|€/g, '');
  if (/^\d+(,\d{0,2})?$/.test(amountQuery)) {
    return amountSearchText(t.amount).startsWith(amountQuery);
  }
  return false;
}

/**
 * Filter + sort (newest first) the booking list of the home screen.
 */
export function filterTransactions(transactions: Transaction[], filters: TransactionListFilters): Transaction[] {
  return transactions
    .filter(t => {
      if (filters.category && t.category !== filters.category) return false;
      if (filters.type !== 'all' && t.type !== filters.type) return false;

      const account = t.sourceAccount || 'volksbank';
      if (filters.account !== 'all' && account !== filters.account) return false;

      // "Kombi" view hides duplicates and PayPal funding transfers (same money twice),
      // single account views only hide duplicates - both unless the user shows them
      if (!filters.showDuplicates) {
        if (t.isDuplicate) return false;
        if (filters.account === 'all' && t.isGuthabenTransfer) return false;
      }

      if (filters.showOnlyOpen && (t.isUserConfirmed || t.isManuallyCategized)) return false;

      return matchesSearch(t, filters.searchQuery);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
