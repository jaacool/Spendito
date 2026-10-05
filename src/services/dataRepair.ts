// File: src/services/dataRepair.ts
/**
 * Data repair for bookings stored by older app versions.
 *
 * Older versions:
 *  - hid normal bank bookings as "Duplikat" when a PayPal booking had the same
 *    amount on the same day, and replaced their text with the PayPal text
 *  - re-categorized bank->PayPal transfers to income/expense (double counting)
 *
 * All functions are pure: they take a list and return a new one.
 * They are safe to run on every app start (idempotent).
 */

import { Transaction } from '../types';
import { categorizationService } from './categorization';
import { duplicateDetectionService } from './duplicateDetection';

export interface RepairResult {
  transactions: Transaction[];
  changed: boolean;
  repairedCount: number;
}

/**
 * Give a booking that was wrongly forced to "transfer" its real category back.
 * A category the user picked by hand is kept.
 */
function recategorize(tx: Transaction): Transaction {
  if (tx.isManuallyCategized) return tx;

  // If the text was lost, categorize by name only and keep the confidence low,
  // so the booking shows up as "Unsicher" and gets reviewed.
  const textLost = duplicateDetectionService.hasLostDescription(tx);
  const { category, confidence } = categorizationService.categorize(
    textLost ? '' : tx.description,
    tx.amount,
    tx.counterparty
  );
  const type: Transaction['type'] =
    category === 'transfer' ? 'transfer' : tx.amount >= 0 ? 'income' : 'expense';

  return {
    ...tx,
    category,
    type,
    confidence: textLost ? Math.min(confidence, 0.5) : confidence,
  };
}

/**
 * Repair legacy duplicate flags and bring all duplicate links up to date.
 * Requires an initialized categorizationService.
 */
export function repairStoredTransactions(transactions: Transaction[]): RepairResult {
  const before = JSON.stringify(transactions);

  // 1. Un-hide normal bank bookings that were wrongly marked as duplicate
  const { transactions: unmarked, repairedIds } =
    duplicateDetectionService.repairLegacyBankDuplicates(transactions);
  const repaired = new Set(repairedIds);
  const recategorized = unmarked.map(t => {
    if (!repaired.has(t.id)) return t;
    // A manual "Umbuchung" on such a booking was chosen because of the wrong PayPal
    // text shown by the old version - it is reset and the booking becomes "offen" again.
    // Other manual categories (e.g. "Foster") are kept.
    if (t.category === 'transfer') {
      return recategorize({ ...t, isManuallyCategized: false, isUserConfirmed: false });
    }
    return recategorize(t);
  });

  // 2. Re-run the (fixed) detection so stored data, list and totals agree.
  //    This also turns re-categorized bank->PayPal transfers back into transfers.
  const linked = duplicateDetectionService.markDuplicates(recategorized);

  return {
    transactions: linked,
    changed: JSON.stringify(linked) !== before,
    repairedCount: repairedIds.length,
  };
}

/**
 * Put the original bank texts (from a new CSV import) back into stored bookings
 * whose text was overwritten by an older app version.
 */
export function applyRestoredDescriptions(
  transactions: Transaction[],
  restored: { externalId: string; description: string }[]
): { transactions: Transaction[]; restoredCount: number } {
  if (restored.length === 0) return { transactions, restoredCount: 0 };

  const byExternalId = new Map(restored.map(r => [r.externalId, r.description]));
  let restoredCount = 0;

  const updated = transactions.map(t => {
    const description = t.externalId ? byExternalId.get(t.externalId) : undefined;
    if (description === undefined || !duplicateDetectionService.hasLostDescription(t)) return t;
    restoredCount++;
    const withText = { ...t, description };
    // Category was only a guess by name - now decide again with the real text
    // (unless the user already confirmed a category for this booking)
    return withText.isDuplicate || withText.isUserConfirmed ? withText : recategorize(withText);
  });

  return { transactions: updated, restoredCount };
}
