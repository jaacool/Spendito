// File: src/services/duplicateDetection.ts
import { Transaction, DuplicateMatch } from '../types';

/**
 * Duplicate detection between Volksbank and PayPal.
 *
 * Background: When something is paid via PayPal and PayPal pulls the money
 * from the bank, the same payment shows up twice:
 *   - Volksbank: "PayPal Europe S.a.r.l..." -10,00 €  (the bank->PayPal transfer)
 *   - PayPal:    "Tierarzt Müller"            -10,00 €  (the real payment)
 * Only the PayPal booking counts as expense; the bank booking is an internal transfer.
 *
 * IMPORTANT RULE: Only bank bookings that really ARE PayPal transfers may be linked.
 * A normal bank booking (e.g. a donation from a person) must never be marked as
 * duplicate just because a PayPal booking with the same amount exists on the same day.
 */

// Configuration for duplicate detection
const CONFIG = {
  // Time window in days between PayPal payment and bank debit
  // (PayPal direct debits arrive up to ~6 days later, seen in real data)
  timeWindowDays: 7,
  // Amount tolerance (absolute difference in EUR)
  amountTolerance: 0.01,
};

// Counterparty of every bank<->PayPal transfer ("PayPal Europe S.a.r.l. et Cie S.C.A")
const BANK_PAYPAL_COUNTERPARTY_PATTERN = /paypal/i;
// PayPal reference in the bank purpose text, e.g. "1046991113506/PP.7142.PP"
const PAYPAL_REFERENCE_PATTERN = /PP\.\d+\.PP/;

// Prefix the old (buggy) version wrote into bank descriptions when linking
const LEGACY_OVERWRITTEN_PREFIX = '[PayPal: ';

// Shown when the original bank text was overwritten by the old version and can only
// be recovered by importing the bank CSV again (see csvImport restoredDescriptions)
export const MISSING_DESCRIPTION_PLACEHOLDER =
  'Verwendungszweck fehlt – bitte Kontoauszug (CSV) erneut importieren';

// Patterns for PayPal Guthaben-Transfer in PayPal transactions
const PAYPAL_GUTHABEN_TRANSFER_PATTERNS = [
  /guthaben.?transfer/i,
  /bank.?transfer/i,
  /guthaben.*paypal/i,
  /paypal.*guthaben/i,
];

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(a: Transaction, b: Transaction): number {
  return Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) / DAY_MS;
}

class DuplicateDetectionService {
  /**
   * True if a Volksbank booking is a money transfer between bank and PayPal.
   * Decided only by structural bank data (counterparty / PayPal reference),
   * never by free text a donor could have typed into the purpose.
   */
  isBankPayPalTransfer(transaction: Transaction): boolean {
    if (transaction.sourceAccount !== 'volksbank') return false;
    return (
      !!transaction.linkedPayPalRef ||
      BANK_PAYPAL_COUNTERPARTY_PATTERN.test(transaction.counterparty || '') ||
      PAYPAL_REFERENCE_PATTERN.test(transaction.description || '')
    );
  }

  /**
   * True if the bank description was overwritten by the old linking logic
   * (or already replaced by the placeholder) and should be restored from the CSV.
   */
  hasLostDescription(transaction: Transaction): boolean {
    return (
      transaction.description.startsWith(LEGACY_OVERWRITTEN_PREFIX) ||
      transaction.description === MISSING_DESCRIPTION_PLACEHOLDER
    );
  }

  /**
   * Check if a PayPal transaction is a Guthaben-Transfer
   */
  isPayPalGuthabenTransfer(transaction: Transaction): boolean {
    if (transaction.sourceAccount !== 'paypal') return false;
    return PAYPAL_GUTHABEN_TRANSFER_PATTERNS.some(p =>
      p.test(transaction.description) || p.test(transaction.counterparty)
    );
  }

  /**
   * Check if a bank PayPal transfer and a PayPal payment belong together.
   * Same direction (sign), same amount, close dates.
   */
  private checkDuplicate(bankTx: Transaction, paypalTx: Transaction): DuplicateMatch | null {
    if (Math.sign(bankTx.amount) !== Math.sign(paypalTx.amount)) return null;

    const amountDiff = Math.abs(Math.abs(bankTx.amount) - Math.abs(paypalTx.amount));
    if (amountDiff > CONFIG.amountTolerance) return null;

    const daysDiff = daysBetween(bankTx, paypalTx);
    if (daysDiff > CONFIG.timeWindowDays) return null;

    const reasons = ['PayPal-Überweisung der Bank', 'Gleicher Betrag'];
    let confidence = 0.7;
    if (daysDiff < 1) {
      confidence += 0.3;
      reasons.push('Gleicher Tag');
    } else if (daysDiff < 3) {
      confidence += 0.2;
      reasons.push('Innerhalb 3 Tagen');
    } else {
      confidence += 0.1;
      reasons.push(`Innerhalb ${CONFIG.timeWindowDays} Tagen`);
    }

    return {
      transaction1: bankTx,
      transaction2: paypalTx,
      confidence: Math.min(confidence, 1),
      reason: reasons.join(', '),
    };
  }

  /**
   * Find bank<->PayPal pairs. Every booking is used at most once (1:1),
   * existing links are kept, otherwise the closest date wins.
   * transaction1 is always the bank booking, transaction2 the PayPal booking.
   */
  findDuplicates(transactions: Transaction[]): DuplicateMatch[] {
    const bankCandidates = transactions.filter(t => this.isBankPayPalTransfer(t));
    const paypalCandidates = transactions.filter(
      t => t.sourceAccount === 'paypal' && !this.isPayPalGuthabenTransfer(t)
    );

    const candidates: { match: DuplicateMatch; sortKey: number }[] = [];
    for (const bankTx of bankCandidates) {
      for (const paypalTx of paypalCandidates) {
        const match = this.checkDuplicate(bankTx, paypalTx);
        if (!match) continue;
        const isExistingLink =
          bankTx.linkedTransactionId === paypalTx.id && paypalTx.linkedTransactionId === bankTx.id;
        // Existing links first (-1), then by date distance
        candidates.push({ match, sortKey: isExistingLink ? -1 : daysBetween(bankTx, paypalTx) });
      }
    }
    candidates.sort((a, b) => a.sortKey - b.sortKey);

    const usedIds = new Set<string>();
    const matches: DuplicateMatch[] = [];
    for (const { match } of candidates) {
      if (usedIds.has(match.transaction1.id) || usedIds.has(match.transaction2.id)) continue;
      usedIds.add(match.transaction1.id);
      usedIds.add(match.transaction2.id);
      matches.push(match);
    }
    return matches;
  }

  /**
   * Link PayPal Guthaben-Transfers with their corresponding real payments
   * A Guthaben-Transfer funds a payment, so they have the same amount and close dates
   */
  linkGuthabenTransfersToPayments(transactions: Transaction[]): Transaction[] {
    const updated = [...transactions];

    const guthabenTransfers = updated.filter(t => this.isPayPalGuthabenTransfer(t));
    const realPayments = updated.filter(t =>
      t.sourceAccount === 'paypal' && !this.isPayPalGuthabenTransfer(t) && t.amount < 0
    );

    for (const transfer of guthabenTransfers) {
      const transferIdx = updated.findIndex(t => t.id === transfer.id);
      if (transferIdx === -1) continue;

      // Find a matching payment (same amount, within 1 day)
      const matchingPayment = realPayments.find(payment =>
        Math.abs(Math.abs(transfer.amount) - Math.abs(payment.amount)) < 0.01 &&
        daysBetween(transfer, payment) <= 1
      );

      if (matchingPayment) {
        // Mark the Guthaben-Transfer as duplicate, link to the real payment
        updated[transferIdx] = {
          ...updated[transferIdx],
          isDuplicate: true,
          isGuthabenTransfer: true,
          linkedPaymentId: matchingPayment.id,
          duplicateReason: `Guthaben-Transfer für: ${matchingPayment.description}`,
          originalPaymentInfo: {
            description: matchingPayment.description,
            counterparty: matchingPayment.counterparty,
            category: matchingPayment.category,
          },
        };
      } else {
        // Standalone transfer: still a Guthaben-Transfer, but not a duplicate
        updated[transferIdx] = {
          ...updated[transferIdx],
          isGuthabenTransfer: true,
          category: 'transfer',
          type: 'transfer',
        };
      }
    }

    return updated;
  }

  /**
   * Auto-mark duplicates in a transaction list.
   * Pure function: returns a new list, the bank description is never changed.
   */
  markDuplicates(transactions: Transaction[]): Transaction[] {
    // 1. Link PayPal Guthaben-Transfers WITHIN PayPal (funding transfers to real payments)
    const updated = this.linkGuthabenTransfersToPayments(transactions);
    const indexById = new Map(updated.map((t, i) => [t.id, i]));

    // 2. Link bank PayPal transfers to the PayPal payment they funded
    for (const match of this.findDuplicates(updated)) {
      const bankIdx = indexById.get(match.transaction1.id);
      const paypalIdx = indexById.get(match.transaction2.id);
      if (bankIdx === undefined || paypalIdx === undefined) continue;

      const bankTx = updated[bankIdx];
      const paypalTx = updated[paypalIdx];
      const isPayPalCounterparty = paypalTx.counterparty === 'PayPal';

      updated[bankIdx] = {
        ...bankTx,
        isDuplicate: true,
        type: 'transfer',
        category: 'transfer',
        linkedTransactionId: paypalTx.id,
        duplicateReason: match.reason,
        linkedPayPalInfo: {
          counterparty: isPayPalCounterparty
            ? (paypalTx.originalPaymentInfo?.counterparty || paypalTx.counterparty)
            : paypalTx.counterparty,
          description: isPayPalCounterparty
            ? (paypalTx.originalPaymentInfo?.description || paypalTx.description)
            : paypalTx.description,
        },
      };
      updated[paypalIdx] = { ...paypalTx, linkedTransactionId: bankTx.id };
    }

    // 3. Remaining bank PayPal transfers (no matching PayPal payment found) are still
    //    internal transfers. A category the user set by hand is respected.
    for (let i = 0; i < updated.length; i++) {
      const tx = updated[i];
      if (tx.isDuplicate || !this.isBankPayPalTransfer(tx)) continue;
      if (tx.isManuallyCategized && tx.category !== 'transfer') continue;
      updated[i] = {
        ...tx,
        isDuplicate: true,
        type: 'transfer',
        category: 'transfer',
        duplicateReason: 'PayPal Guthaben-Transfer (Bank)',
      };
    }

    return updated;
  }

  /**
   * One-time repair of data written by the old, too aggressive detection:
   * normal bank bookings (no PayPal transfer) that were hidden as duplicate.
   * Returns the repaired list and the ids that need a new category.
   */
  repairLegacyBankDuplicates(transactions: Transaction[]): {
    transactions: Transaction[];
    repairedIds: string[];
  } {
    const repairedIds: string[] = [];

    let updated = transactions.map(t => {
      if (t.sourceAccount !== 'volksbank' || !t.isDuplicate || this.isBankPayPalTransfer(t)) {
        return t;
      }
      repairedIds.push(t.id);
      const { linkedTransactionId, duplicateReason, linkedPayPalInfo, ...rest } = t;
      return {
        ...rest,
        isDuplicate: false,
        // The old version replaced the bank text with the PayPal text of another booking.
        // That text is wrong, so we show a hint until the CSV is imported again.
        description: t.description.startsWith(LEGACY_OVERWRITTEN_PREFIX)
          ? MISSING_DESCRIPTION_PLACEHOLDER
          : t.description,
      };
    });

    // PayPal bookings must no longer point to the repaired bank bookings
    if (repairedIds.length > 0) {
      const repaired = new Set(repairedIds);
      updated = updated.map(t => {
        if (t.sourceAccount !== 'paypal' || !t.linkedTransactionId || !repaired.has(t.linkedTransactionId)) {
          return t;
        }
        const { linkedTransactionId, ...rest } = t;
        return rest;
      });
    }

    return { transactions: updated, repairedIds };
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
