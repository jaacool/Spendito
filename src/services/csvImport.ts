/**
 * CSV Import Service
 * 
 * Parses Volksbank CSV exports and imports transactions.
 * Handles PayPal duplicate detection to avoid double-counting.
 */

import { Transaction } from '../types';
import { categorizationService } from './categorization';
// Generate UUID without external dependency
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Volksbank CSV column indices (0-based)
const CSV_COLUMNS = {
  ACCOUNT_NAME: 0,
  ACCOUNT_IBAN: 1,
  ACCOUNT_BIC: 2,
  BANK_NAME: 3,
  BOOKING_DATE: 4,
  VALUE_DATE: 5,
  COUNTERPARTY_NAME: 6,
  COUNTERPARTY_IBAN: 7,
  COUNTERPARTY_BIC: 8,
  BOOKING_TEXT: 9,
  PURPOSE: 10,
  AMOUNT: 11,
  CURRENCY: 12,
  BALANCE: 13,
  NOTE: 14,
  MARKED: 15,
  CREDITOR_ID: 16,
  MANDATE_REF: 17,
};

// PayPal identifiers for duplicate detection
const PAYPAL_IDENTIFIERS = {
  NAME: 'PayPal Europe S.a.r.l. et Cie S.C.A',
  IBAN: 'LU89751000135104200E',
  BIC: 'PPLXLUL2',
  PURPOSE_PATTERN: /PP\.\d+\.PP/,
};

export interface CSVImportResult {
  success: boolean;
  totalRows: number;
  imported: number;
  skippedPayPal: number;
  skippedDuplicates: number;
  errors: string[];
  transactions: Transaction[];
}

export interface CSVParseOptions {
  skipPayPalTransfers?: boolean; // Skip PayPal bank transfers (default: false - now categorized as transfer)
  markPayPalAsLinked?: boolean;  // Mark PayPal transfers as linked (default: true)
}

/**
 * Parse German date format (DD.MM.YYYY) to ISO string
 */
function parseGermanDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  
  const parts = dateStr.split('.');
  if (parts.length !== 3) return new Date().toISOString();
  
  const [day, month, year] = parts;
  return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
}

/**
 * Parse German amount format (1.234,56 or -1.234,56) to number
 */
function parseGermanAmount(amountStr: string): number {
  if (!amountStr) return 0;
  
  // Remove thousand separators (.) and replace decimal comma with dot
  const normalized = amountStr
    .replace(/\./g, '')
    .replace(',', '.');
  
  return parseFloat(normalized) || 0;
}

/**
 * Check if a transaction is a PayPal bank transfer
 */
function isPayPalTransfer(row: string[]): boolean {
  const counterpartyName = row[CSV_COLUMNS.COUNTERPARTY_NAME] || '';
  const counterpartyIban = row[CSV_COLUMNS.COUNTERPARTY_IBAN] || '';
  const counterpartyBic = row[CSV_COLUMNS.COUNTERPARTY_BIC] || '';
  const purpose = row[CSV_COLUMNS.PURPOSE] || '';
  
  // Check if it's PayPal
  const isPayPal = 
    counterpartyName.includes('PayPal') ||
    counterpartyIban === PAYPAL_IDENTIFIERS.IBAN ||
    counterpartyBic === PAYPAL_IDENTIFIERS.BIC ||
    PAYPAL_IDENTIFIERS.PURPOSE_PATTERN.test(purpose);
  
  return isPayPal;
}

/**
 * Extract PayPal reference from purpose text
 */
function extractPayPalReference(purpose: string): string | null {
  // Match patterns like "1046991113506/PP.7142.PP"
  const match = purpose.match(/(\d+)\/PP\.\d+\.PP/);
  return match ? match[1] : null;
}

/**
 * Generate a unique external ID for a transaction
 */
function generateExternalId(row: string[]): string {
  const date = row[CSV_COLUMNS.BOOKING_DATE];
  const amount = row[CSV_COLUMNS.AMOUNT];
  const counterparty = row[CSV_COLUMNS.COUNTERPARTY_NAME] || 'unknown';
  const purpose = row[CSV_COLUMNS.PURPOSE] || '';
  
  // Create a hash-like ID from the transaction details
  return `bank_${date}_${amount}_${counterparty.substring(0, 20)}_${purpose.substring(0, 30)}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): string[][] {
  const lines = content.split('\n');
  const rows: string[][] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Split by semicolon, handling quoted fields
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    
    rows.push(row);
  }
  
  return rows;
}

/**
 * Import transactions from Volksbank CSV
 */
export async function importVolksbankCSV(
  csvContent: string,
  existingTransactions: Transaction[] = [],
  options: CSVParseOptions = {}
): Promise<CSVImportResult> {
  const { skipPayPalTransfers = false, markPayPalAsLinked = true } = options;
  
  await categorizationService.initialize();
  
  const result: CSVImportResult = {
    success: false,
    totalRows: 0,
    imported: 0,
    skippedPayPal: 0,
    skippedDuplicates: 0,
    errors: [],
    transactions: [],
  };
  
  try {
    const rows = parseCSV(csvContent);
    
    if (rows.length < 2) {
      result.errors.push('CSV-Datei enthält keine Daten');
      return result;
    }
    
    // Skip header row
    const dataRows = rows.slice(1);
    result.totalRows = dataRows.length;
    
    // Create a set of existing external IDs for duplicate detection
    const existingIds = new Set(
      existingTransactions
        .filter(t => t.externalId)
        .map(t => t.externalId)
    );
    
    // Also create a set of existing PayPal references
    const existingPayPalRefs = new Set(
      existingTransactions
        .filter(t => t.sourceAccount === 'paypal' && t.externalId)
        .map(t => t.externalId)
    );
    
    for (const row of dataRows) {
      if (row.length < 12) {
        result.errors.push(`Zeile übersprungen: Nicht genug Spalten (${row.length})`);
        continue;
      }
      
      const isPayPal = isPayPalTransfer(row);
      const paypalRef = isPayPal ? extractPayPalReference(row[CSV_COLUMNS.PURPOSE] || '') : null;
      
      // Skip PayPal transfers if option is set
      if (isPayPal && skipPayPalTransfers) {
        result.skippedPayPal++;
        continue;
      }
      
      // Generate external ID
      const externalId = generateExternalId(row);
      
      // Check for duplicates
      if (existingIds.has(externalId)) {
        result.skippedDuplicates++;
        continue;
      }
      
      // Parse transaction data
      const amount = parseGermanAmount(row[CSV_COLUMNS.AMOUNT]);
      const date = parseGermanDate(row[CSV_COLUMNS.BOOKING_DATE]);
      const counterparty = row[CSV_COLUMNS.COUNTERPARTY_NAME] || 'Unbekannt';
      const purpose = row[CSV_COLUMNS.PURPOSE] || '';
      const bookingText = row[CSV_COLUMNS.BOOKING_TEXT] || '';
      
      // Build description
      const description = purpose || bookingText || counterparty;
      
      // Categorize - PayPal transfers are automatically categorized as 'transfer'
      let category: any;
      let confidence: number;
      let txType: 'income' | 'expense' | 'transfer';
      
      if (isPayPal) {
        // PayPal bank transfers are internal movements, not real income/expense
        category = 'transfer';
        confidence = 0.95;
        txType = 'transfer';
      } else {
        const result = categorizationService.categorize(description, amount);
        category = result.category;
        confidence = result.confidence;
        // Check if categorization detected a transfer
        txType = category === 'transfer' ? 'transfer' : (amount >= 0 ? 'income' : 'expense');
      }
      
      const transaction: Transaction = {
        id: generateUUID(),
        date,
        amount,
        type: txType,
        category,
        description,
        counterparty,
        isManuallyCategized: false,
        confidence,
        sourceAccount: 'volksbank',
        externalId,
        // Mark PayPal transfers specially
        ...(isPayPal && markPayPalAsLinked && paypalRef ? { linkedPayPalRef: paypalRef } : {}),
      };
      
      result.transactions.push(transaction);
      existingIds.add(externalId);
      result.imported++;
    }
    
    result.success = true;
  } catch (error: any) {
    result.errors.push(`Parsing-Fehler: ${error.message}`);
  }
  
  return result;
}

/**
 * Detect potential PayPal duplicates between bank and PayPal transactions
 * Returns transactions that appear in both sources
 */
export function detectPayPalDuplicates(
  bankTransactions: Transaction[],
  paypalTransactions: Transaction[]
): { bankTx: Transaction; paypalTx: Transaction; confidence: number }[] {
  const duplicates: { bankTx: Transaction; paypalTx: Transaction; confidence: number }[] = [];
  
  // PayPal bank transfers are typically:
  // - Negative amounts from bank (money going to PayPal)
  // - Positive amounts from PayPal (money coming from PayPal to bank)
  
  for (const bankTx of bankTransactions) {
    // Only check PayPal-related bank transactions
    if (!bankTx.counterparty?.includes('PayPal')) continue;
    
    for (const paypalTx of paypalTransactions) {
      // Check if amounts match (opposite signs)
      // Bank: -100 (outgoing) should match PayPal: -100 (payment made via PayPal)
      // Bank: +100 (incoming) should match PayPal: +100 (refund or transfer)
      
      const amountMatch = Math.abs(bankTx.amount) === Math.abs(paypalTx.amount);
      
      // Check if dates are close (within 3 days due to processing time)
      const bankDate = new Date(bankTx.date);
      const paypalDate = new Date(paypalTx.date);
      const daysDiff = Math.abs((bankDate.getTime() - paypalDate.getTime()) / (1000 * 60 * 60 * 24));
      const dateMatch = daysDiff <= 3;
      
      if (amountMatch && dateMatch) {
        const confidence = dateMatch && amountMatch ? 0.9 : 0.5;
        duplicates.push({ bankTx, paypalTx, confidence });
      }
    }
  }
  
  return duplicates;
}

export const csvImportService = {
  importVolksbankCSV,
  detectPayPalDuplicates,
  parseGermanDate,
  parseGermanAmount,
  isPayPalTransfer,
};
