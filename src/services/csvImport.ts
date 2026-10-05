// File: src/services/csvImport.ts
/**
 * CSV Import Service
 *
 * Parses Volksbank CSV exports and imports transactions.
 * PayPal transfers are imported as internal transfers; the link to the
 * matching PayPal booking is done later by duplicateDetectionService.
 */

import { Transaction } from '../types';
import { categorizationService } from './categorization';
import { duplicateDetectionService } from './duplicateDetection';
import { parseCSV, parseGermanDate, parseGermanAmount, decodeCSVBuffer } from './csvParser';

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

// PayPal identifiers for detecting bank<->PayPal transfers
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
  // Original bank texts for already stored bookings whose description was
  // overwritten by an older app version (matched via externalId)
  restoredDescriptions: { externalId: string; description: string }[];
}

export interface CSVParseOptions {
  markPayPalAsLinked?: boolean;  // Mark PayPal transfers as linked (default: true)
}

/**
 * Check if a transaction is a PayPal bank transfer
 */
function isPayPalTransfer(row: string[]): boolean {
  const counterpartyName = row[CSV_COLUMNS.COUNTERPARTY_NAME] || '';
  const counterpartyIban = row[CSV_COLUMNS.COUNTERPARTY_IBAN] || '';
  const counterpartyBic = row[CSV_COLUMNS.COUNTERPARTY_BIC] || '';
  const purpose = row[CSV_COLUMNS.PURPOSE] || '';

  return (
    counterpartyName.includes('PayPal') ||
    counterpartyIban === PAYPAL_IDENTIFIERS.IBAN ||
    counterpartyBic === PAYPAL_IDENTIFIERS.BIC ||
    PAYPAL_IDENTIFIERS.PURPOSE_PATTERN.test(purpose)
  );
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
 * Generate the base external ID of a bank row.
 * WARNING: Do not change this format - already imported bookings are matched by it.
 * Identical rows (same date, amount, name, purpose) share this base ID and are
 * told apart by an occurrence suffix in importVolksbankCSV.
 */
function generateBaseExternalId(row: string[]): string {
  const date = row[CSV_COLUMNS.BOOKING_DATE];
  const amount = row[CSV_COLUMNS.AMOUNT];
  const counterparty = row[CSV_COLUMNS.COUNTERPARTY_NAME] || 'unknown';
  const purpose = row[CSV_COLUMNS.PURPOSE] || '';

  return `bank_${date}_${amount}_${counterparty.substring(0, 20)}_${purpose.substring(0, 30)}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Import transactions from Volksbank CSV
 */
export async function importVolksbankCSV(
  csvContent: string,
  existingTransactions: Transaction[] = [],
  options: CSVParseOptions = {}
): Promise<CSVImportResult> {
  const { markPayPalAsLinked = true } = options;

  await categorizationService.initialize();

  const result: CSVImportResult = {
    success: false,
    totalRows: 0,
    imported: 0,
    skippedPayPal: 0,
    skippedDuplicates: 0,
    errors: [],
    transactions: [],
    restoredDescriptions: [],
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

    // Existing bookings by external ID (for duplicate check and text restore)
    const existingByExternalId = new Map<string, Transaction>();
    existingTransactions.forEach(t => {
      if (t.externalId) existingByExternalId.set(t.externalId, t);
    });

    // Counts identical rows within this file. The 1st occurrence keeps the old ID
    // (stays compatible with earlier imports), the 2nd gets "__2" and so on.
    // Before this, two identical bookings (e.g. two equal membership fees on the
    // same day) were imported only once.
    const occurrences = new Map<string, number>();

    dataRows.forEach((row, index) => {
      const lineNumber = index + 2; // +1 header, +1 for 1-based counting

      if (row.length < 12) {
        result.errors.push(`Zeile ${lineNumber} übersprungen: Nicht genug Spalten (${row.length})`);
        return;
      }

      const baseId = generateBaseExternalId(row);
      const occurrence = (occurrences.get(baseId) || 0) + 1;
      occurrences.set(baseId, occurrence);
      const externalId = occurrence === 1 ? baseId : `${baseId}__${occurrence}`;

      const counterparty = row[CSV_COLUMNS.COUNTERPARTY_NAME] || 'Unbekannt';
      const purpose = row[CSV_COLUMNS.PURPOSE] || '';
      const bookingText = row[CSV_COLUMNS.BOOKING_TEXT] || '';
      const description = purpose || bookingText || counterparty;

      // Already imported: skip, but restore the original text if it was lost
      const existing = existingByExternalId.get(externalId);
      if (existing) {
        if (duplicateDetectionService.hasLostDescription(existing)) {
          result.restoredDescriptions.push({ externalId, description });
        }
        result.skippedDuplicates++;
        return;
      }

      // Parse transaction data - invalid values are reported, never guessed
      const amount = parseGermanAmount(row[CSV_COLUMNS.AMOUNT]);
      const date = parseGermanDate(row[CSV_COLUMNS.BOOKING_DATE]);
      if (amount === null || date === null) {
        result.errors.push(
          `Zeile ${lineNumber} übersprungen: ${date === null ? 'Ungültiges Datum' : 'Ungültiger Betrag'} (${counterparty})`
        );
        return;
      }

      const isPayPal = isPayPalTransfer(row);
      const paypalRef = isPayPal ? extractPayPalReference(purpose) : null;

      let category: Transaction['category'];
      let confidence: number;
      let txType: Transaction['type'];

      if (isPayPal) {
        // PayPal bank transfers are internal movements. They are ALWAYS imported to
        // keep the bank balance correct, but never count as income/expense.
        category = 'transfer';
        confidence = 0.95;
        txType = 'transfer';
      } else {
        const catResult = categorizationService.categorize(description, amount, counterparty);
        category = catResult.category;
        confidence = catResult.confidence;
        txType = category === 'transfer' ? 'transfer' : (amount >= 0 ? 'income' : 'expense');
      }

      result.transactions.push({
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
        ...(isPayPal && markPayPalAsLinked && paypalRef ? { linkedPayPalRef: paypalRef } : {}),
      });
      result.imported++;
    });

    result.success = true;
  } catch (error: any) {
    result.errors.push(`Die Datei konnte nicht gelesen werden: ${error?.message || 'Unbekannter Fehler'}`);
  }

  return result;
}

export const csvImportService = {
  importVolksbankCSV,
  decodeCSVBuffer,
  parseGermanDate,
  parseGermanAmount,
  isPayPalTransfer,
};
