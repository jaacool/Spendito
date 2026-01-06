// Transaction Types
export type TransactionType = 'income' | 'expense';

export type SourceAccount = 'volksbank' | 'paypal';

export type IncomeCategory = 
  | 'donation'      // Spenden
  | 'protection_fee' // Schutzgebühren
  | 'membership'    // Mitgliedsbeiträge
  | 'other_income'; // Sonstiges

export type ExpenseCategory = 
  | 'veterinary'    // Tierarzt
  | 'foster_care'   // Foster
  | 'transport'     // Transport
  | 'administration' // Verwaltung
  | 'other_expense'; // Sonstiges

export type Category = IncomeCategory | ExpenseCategory;

// Account metadata
export const ACCOUNT_INFO: Record<SourceAccount, { label: string; color: string; icon: string }> = {
  volksbank: { label: 'Volksbank', color: '#0066b3', icon: 'building' },
  paypal: { label: 'PayPal', color: '#003087', icon: 'wallet' },
};

export interface Transaction {
  id: string;
  date: string; // ISO date string
  amount: number; // positive for income, negative for expense
  type: TransactionType;
  category: Category;
  description: string; // Verwendungszweck
  counterparty: string; // Auftraggeber/Empfänger
  isManuallyCategized: boolean;
  confidence: number; // 0-1, how confident the categorization is
  rawData?: string; // Original bank data
  // Multi-Account Support
  sourceAccount: SourceAccount;
  externalId?: string; // Unique ID from bank/PayPal for deduplication
  linkedTransactionId?: string; // Link to duplicate transaction
  isDuplicate?: boolean; // True if this is a duplicate (hidden from totals)
  duplicateReason?: string; // Why it was marked as duplicate
}

// Duplicate detection result
export interface DuplicateMatch {
  transaction1: Transaction;
  transaction2: Transaction;
  confidence: number; // 0-1, how confident we are it's a duplicate
  reason: string;
}

export interface CategoryRule {
  id: string;
  pattern: string; // Regex pattern to match description
  category: Category;
  priority: number; // Higher priority rules are checked first
  matchCount: number; // How many times this rule was used
  createdAt: string;
  isUserDefined: boolean;
  minAmount?: number; // Optional amount range for categorization
  maxAmount?: number;
}

export interface CategorySummary {
  category: Category;
  total: number;
  count: number;
  percentage: number;
}

export interface YearSummary {
  year: number;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  incomeByCategory: CategorySummary[];
  expenseByCategory: CategorySummary[];
}

// Category metadata for display
export const CATEGORY_INFO: Record<Category, { label: string; labelDe: string; icon: string; color: string }> = {
  // Income
  donation: { label: 'Donations', labelDe: 'Spenden', icon: 'heart', color: '#22c55e' },
  protection_fee: { label: 'Protection Fees', labelDe: 'Schutzgebühren', icon: 'shield', color: '#3b82f6' },
  membership: { label: 'Membership', labelDe: 'Mitgliedsbeiträge', icon: 'users', color: '#8b5cf6' },
  other_income: { label: 'Other Income', labelDe: 'Sonstige Einnahmen', icon: 'plus-circle', color: '#6b7280' },
  // Expense
  veterinary: { label: 'Veterinary', labelDe: 'Tierarzt', icon: 'stethoscope', color: '#ef4444' },
  foster_care: { label: 'Foster', labelDe: 'Foster', icon: 'home', color: '#ec4899' },
  transport: { label: 'Transport', labelDe: 'Transport', icon: 'truck', color: '#f97316' },
  administration: { label: 'Administration', labelDe: 'Verwaltung', icon: 'file-text', color: '#64748b' },
  other_expense: { label: 'Other', labelDe: 'Sonstiges', icon: 'minus-circle', color: '#94a3b8' },
};

export const INCOME_CATEGORIES: IncomeCategory[] = ['donation', 'protection_fee', 'membership', 'other_income'];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['veterinary', 'foster_care', 'transport', 'administration', 'other_expense'];
