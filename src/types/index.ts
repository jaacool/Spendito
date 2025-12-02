// Transaction Types
export type TransactionType = 'income' | 'expense';

export type IncomeCategory = 
  | 'donation'      // Spenden
  | 'protection_fee' // Schutzgebühren
  | 'membership'    // Mitgliedsbeiträge
  | 'other_income'; // Sonstiges

export type ExpenseCategory = 
  | 'veterinary'    // Tierarzt
  | 'food'          // Futter
  | 'transport'     // Transport
  | 'foster_care'   // Pflegestellen
  | 'administration' // Verwaltung
  | 'other_expense'; // Sonstiges

export type Category = IncomeCategory | ExpenseCategory;

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
}

export interface CategoryRule {
  id: string;
  pattern: string; // Regex pattern to match description
  category: Category;
  priority: number; // Higher priority rules are checked first
  matchCount: number; // How many times this rule was used
  createdAt: string;
  isUserDefined: boolean;
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
  food: { label: 'Food', labelDe: 'Futter', icon: 'utensils', color: '#f97316' },
  transport: { label: 'Transport', labelDe: 'Transport', icon: 'truck', color: '#eab308' },
  foster_care: { label: 'Foster Care', labelDe: 'Pflegestellen', icon: 'home', color: '#ec4899' },
  administration: { label: 'Administration', labelDe: 'Verwaltung', icon: 'file-text', color: '#64748b' },
  other_expense: { label: 'Other Expense', labelDe: 'Sonstige Ausgaben', icon: 'minus-circle', color: '#94a3b8' },
};

export const INCOME_CATEGORIES: IncomeCategory[] = ['donation', 'protection_fee', 'membership', 'other_income'];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['veterinary', 'food', 'transport', 'foster_care', 'administration', 'other_expense'];
