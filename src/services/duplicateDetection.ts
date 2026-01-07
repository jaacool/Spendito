import { Transaction, DuplicateMatch } from '../types';

// Configuration for duplicate detection
const CONFIG = {
  // Time window in days for potential duplicates
  timeWindowDays: 5,
  // Amount tolerance (absolute difference in EUR)
  amountTolerance: 0.01,
  // Minimum similarity score for description matching (0-1)
  minDescriptionSimilarity: 0.3,
  // Confidence thresholds
  highConfidence: 0.9,
  mediumConfidence: 0.7,
};

// Common PayPal patterns in Volksbank statements
const PAYPAL_PATTERNS = [
  /paypal/i,
  /pp\./i,
  /pp\*/i,
  /paypal \*/i,
];

// Patterns that indicate a PayPal balance transfer (not a real expense)
const PAYPAL_TRANSFER_PATTERNS = [
  /paypal.*guthaben/i,
  /paypal.*einzahlung/i,
  /paypal.*überweisung/i,
  /paypal.*lastschrift/i,
  /paypal europe/i,
];

// Patterns for PayPal Guthaben-Transfer in PayPal transactions
const PAYPAL_GUTHABEN_TRANSFER_PATTERNS = [
  /guthaben.?transfer/i,
  /bank.?transfer/i,
  /guthaben.*paypal/i,
  /paypal.*guthaben/i,
];

class DuplicateDetectionService {
  /**
   * Find potential duplicates between transactions from different accounts
   */
  findDuplicates(transactions: Transaction[]): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    
    // Separate by account
    const volksbankTx = transactions.filter(t => t.sourceAccount === 'volksbank');
    const paypalTx = transactions.filter(t => t.sourceAccount === 'paypal');
    
    // Compare each PayPal transaction with Volksbank transactions
    for (const paypal of paypalTx) {
      for (const volksbank of volksbankTx) {
        const match = this.checkDuplicate(paypal, volksbank);
        if (match) {
          matches.push(match);
        }
      }
    }
    
    return matches;
  }

  /**
   * Check if two transactions are duplicates
   */
  private checkDuplicate(tx1: Transaction, tx2: Transaction): DuplicateMatch | null {
    // Must be from different accounts
    if (tx1.sourceAccount === tx2.sourceAccount) return null;
    
    // Must be same type (both income or both expense)
    if (tx1.type !== tx2.type) return null;
    
    // Check time window
    const date1 = new Date(tx1.date);
    const date2 = new Date(tx2.date);
    const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff > CONFIG.timeWindowDays) return null;
    
    // Check amount match
    const amountDiff = Math.abs(Math.abs(tx1.amount) - Math.abs(tx2.amount));
    if (amountDiff > CONFIG.amountTolerance) return null;
    
    // Calculate confidence based on various factors
    let confidence = 0;
    const reasons: string[] = [];
    
    // Exact amount match
    if (amountDiff < 0.01) {
      confidence += 0.4;
      reasons.push('Gleicher Betrag');
    }
    
    // Same day
    if (daysDiff < 1) {
      confidence += 0.3;
      reasons.push('Gleicher Tag');
    } else if (daysDiff < 3) {
      confidence += 0.2;
      reasons.push('Innerhalb 3 Tagen');
    } else {
      confidence += 0.1;
      reasons.push('Innerhalb 5 Tagen');
    }
    
    // Check for PayPal pattern in Volksbank description
    const volksbankTx = tx1.sourceAccount === 'volksbank' ? tx1 : tx2;
    const paypalTx = tx1.sourceAccount === 'paypal' ? tx1 : tx2;
    
    const hasPayPalPattern = PAYPAL_PATTERNS.some(p => p.test(volksbankTx.description));
    if (hasPayPalPattern) {
      confidence += 0.3;
      reasons.push('PayPal-Muster in Volksbank');
    }
    
    // Check description similarity
    const similarity = this.calculateSimilarity(
      tx1.description.toLowerCase(),
      tx2.description.toLowerCase()
    );
    
    if (similarity > 0.5) {
      confidence += 0.2;
      reasons.push('Ähnliche Beschreibung');
    }
    
    // Minimum confidence threshold
    if (confidence < CONFIG.mediumConfidence) return null;
    
    return {
      transaction1: tx1,
      transaction2: tx2,
      confidence: Math.min(confidence, 1),
      reason: reasons.join(', '),
    };
  }

  /**
   * Check if a Volksbank transaction is a PayPal balance transfer
   * (should not be counted as expense, just internal transfer)
   */
  isPayPalTransfer(transaction: Transaction): boolean {
    if (transaction.sourceAccount !== 'volksbank') return false;
    return PAYPAL_TRANSFER_PATTERNS.some(p => p.test(transaction.description));
  }

  /**
   * Calculate similarity between two strings (Jaccard similarity)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
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
   * Link PayPal Guthaben-Transfers with their corresponding real payments
   * A Guthaben-Transfer funds a payment, so they have the same amount and close dates
   */
  linkGuthabenTransfersToPayments(transactions: Transaction[]): Transaction[] {
    const updated = [...transactions];
    
    // Find all PayPal Guthaben-Transfers
    const guthabenTransfers = updated.filter(t => 
      t.sourceAccount === 'paypal' && this.isPayPalGuthabenTransfer(t)
    );
    
    // Find all real PayPal payments (not Guthaben-Transfers)
    const realPayments = updated.filter(t => 
      t.sourceAccount === 'paypal' && 
      !this.isPayPalGuthabenTransfer(t) &&
      t.amount < 0 // Only expenses
    );
    
    for (const transfer of guthabenTransfers) {
      const transferIdx = updated.findIndex(t => t.id === transfer.id);
      if (transferIdx === -1) continue;
      
      // Find a matching payment (same amount, within 1 day)
      const matchingPayment = realPayments.find(payment => {
        const amountMatch = Math.abs(Math.abs(transfer.amount) - Math.abs(payment.amount)) < 0.01;
        const transferDate = new Date(transfer.date);
        const paymentDate = new Date(payment.date);
        const daysDiff = Math.abs(transferDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24);
        const dateMatch = daysDiff <= 1;
        
        return amountMatch && dateMatch;
      });
      
      if (matchingPayment) {
        // Mark the Guthaben-Transfer as duplicate, link to the real payment
        updated[transferIdx] = {
          ...updated[transferIdx],
          isDuplicate: true,
          isGuthabenTransfer: true,
          linkedPaymentId: matchingPayment.id,
          duplicateReason: `Guthaben-Transfer für: ${matchingPayment.description}`,
          // Preserve original payment info for reference
          originalPaymentInfo: {
            description: matchingPayment.description,
            counterparty: matchingPayment.counterparty,
            category: matchingPayment.category,
          },
        };
      } else {
        // No matching payment found - this might be a standalone transfer
        // Still mark as Guthaben-Transfer but not as duplicate
        updated[transferIdx] = {
          ...updated[transferIdx],
          isGuthabenTransfer: true,
          category: 'transfer' as any,
          type: 'transfer',
        };
      }
    }
    
    return updated;
  }

  /**
   * Auto-mark duplicates in a transaction list
   * Returns the updated list with isDuplicate flags set
   */
  markDuplicates(transactions: Transaction[]): Transaction[] {
    const duplicates = this.findDuplicates(transactions);
    let updatedTransactions = [...transactions];
    
    // First, link PayPal Guthaben-Transfers to their real payments
    updatedTransactions = this.linkGuthabenTransfersToPayments(updatedTransactions);
    
    for (const match of duplicates) {
      // Find the transactions in the list
      const idx1 = updatedTransactions.findIndex(t => t.id === match.transaction1.id);
      const idx2 = updatedTransactions.findIndex(t => t.id === match.transaction2.id);
      
      if (idx1 === -1 || idx2 === -1) continue;
      
      // Mark the Volksbank transaction as duplicate (keep PayPal as primary)
      // This is because PayPal shows the actual merchant, Volksbank just shows "PayPal"
      const volksbankIdx = updatedTransactions[idx1].sourceAccount === 'volksbank' ? idx1 : idx2;
      const paypalIdx = updatedTransactions[idx1].sourceAccount === 'paypal' ? idx1 : idx2;
      
      if (match.confidence >= CONFIG.highConfidence) {
        // Auto-mark as duplicate
        updatedTransactions[volksbankIdx] = {
          ...updatedTransactions[volksbankIdx],
          isDuplicate: true,
          linkedTransactionId: updatedTransactions[paypalIdx].id,
          duplicateReason: match.reason,
        };
      }
    }
    
    // Also mark PayPal balance transfers from bank
    for (let i = 0; i < updatedTransactions.length; i++) {
      if (this.isPayPalTransfer(updatedTransactions[i])) {
        updatedTransactions[i] = {
          ...updatedTransactions[i],
          isDuplicate: true,
          duplicateReason: 'PayPal Guthaben-Transfer (Bank)',
        };
      }
    }
    
    return updatedTransactions;
  }

  /**
   * Get transactions excluding duplicates (for totals calculation)
   */
  getUniqueTransactions(transactions: Transaction[]): Transaction[] {
    return transactions.filter(t => !t.isDuplicate);
  }

  /**
   * Get duplicate pairs for review
   */
  getDuplicatePairs(transactions: Transaction[]): { primary: Transaction; duplicate: Transaction }[] {
    const pairs: { primary: Transaction; duplicate: Transaction }[] = [];
    
    for (const tx of transactions) {
      if (tx.isDuplicate && tx.linkedTransactionId) {
        const primary = transactions.find(t => t.id === tx.linkedTransactionId);
        if (primary) {
          pairs.push({ primary, duplicate: tx });
        }
      }
    }
    
    return pairs;
  }
}

export const duplicateDetectionService = new DuplicateDetectionService();
