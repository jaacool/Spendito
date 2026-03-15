import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, CategoryRule, Transaction, INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES } from '../types';

const RULES_STORAGE_KEY = '@spendito_category_rules';

// Default rules for initial categorization
const DEFAULT_RULES: Omit<CategoryRule, 'id' | 'createdAt' | 'matchCount'>[] = [
  // Transfer patterns (highest priority - check first)
  { pattern: 'guthaben.?transfer|umbuchung|übertrag|transfer zwischen|eigenes konto', category: 'transfer', priority: 150, isUserDefined: false },
  { pattern: 'paypal.*einzahlung|einzahlung.*paypal|paypal.*auszahlung|auszahlung.*paypal', category: 'transfer', priority: 150, isUserDefined: false },
  { pattern: 'paypal guthaben|paypal-guthaben|guthaben paypal', category: 'transfer', priority: 150, isUserDefined: false },
  
  // Income patterns
  { pattern: 'spende|donation|geschenk', category: 'donation', priority: 100, isUserDefined: false },
  { pattern: 'schutzgebühr|schutzgeb|adoption', category: 'protection_fee', priority: 100, isUserDefined: false },
  { pattern: 'mitglied|beitrag|membership', category: 'membership', priority: 100, isUserDefined: false },
  
  // Expense patterns
  { pattern: 'tierarzt|tierärzt|vet|tierklinik|tiermedizin|impf|kastration|sterilisation|medikament', category: 'veterinary', priority: 100, isUserDefined: false },
  { pattern: 'pflegestelle|pflege|unterbringung|pension|foster|futter|fressnapf|zooplus', category: 'foster_care', priority: 100, isUserDefined: false },
  { pattern: 'transport|fahrt|benzin|tankstelle|flug|fähre|reise', category: 'transport', priority: 100, isUserDefined: false },
  { pattern: 'büro|porto|druck|verwaltung|versicherung|bank|gebühr|steuer', category: 'administration', priority: 90, isUserDefined: false },
];

class CategorizationService {
  private rules: CategoryRule[] = [];
  private initialized = false;

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    try {
      // 1. Try to load local rules first
      const stored = await AsyncStorage.getItem(RULES_STORAGE_KEY);
      if (stored && !force) {
        this.rules = JSON.parse(stored);
        // Ensure transfer rules exist (migration for existing users)
        await this.ensureTransferRules();
      } else {
        // Initialize with default rules
        this.rules = DEFAULT_RULES.map((rule, index) => ({
          ...rule,
          id: `default_${index}`,
          createdAt: new Date().toISOString(),
          matchCount: 0,
        }));
        await this.saveRules();
      }
    } catch (error) {
      console.error('Failed to load categorization rules:', error);
      this.rules = [];
    }
    
    this.initialized = true;
  }

  private async saveRules(): Promise<void> {
    try {
      await AsyncStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(this.rules));
    } catch (error) {
      console.error('Failed to save categorization rules:', error);
    }
  }

  categorize(
    description: string, 
    amount: number, 
    counterparty?: string
  ): { category: Category; confidence: number } {
    const normalizedDesc = description.toLowerCase();
    const normalizedCounterparty = counterparty?.toLowerCase() || '';
    const isExpense = amount < 0;
    const absAmount = Math.abs(amount);
    
    // Sort rules by priority (highest first)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      try {
        // Multi-factor matching: Keywords + Counterparty + Amount
        let descriptionMatch = false;
        let counterpartyMatch = false;
        let amountMatch = true; // Default true, only false if range specified and outside
        
        // 1. Check description pattern
        const descRegex = new RegExp(rule.pattern, 'i');
        descriptionMatch = descRegex.test(normalizedDesc);
        
        // 2. Check counterparty pattern (if specified)
        if (rule.counterpartyPattern && normalizedCounterparty) {
          const counterpartyRegex = new RegExp(rule.counterpartyPattern, 'i');
          counterpartyMatch = counterpartyRegex.test(normalizedCounterparty);
        }
        
        // 3. Check amount range (if specified)
        if (rule.minAmount !== undefined && absAmount < rule.minAmount) {
          amountMatch = false;
        }
        if (rule.maxAmount !== undefined && absAmount > rule.maxAmount) {
          amountMatch = false;
        }
        
        // Match if: (description OR counterparty) AND amount
        const hasMatch = (descriptionMatch || counterpartyMatch) && amountMatch;
        
        if (hasMatch) {
          // Transfer category can match any transaction type
          const isTransferCategory = TRANSFER_CATEGORIES.includes(rule.category as any);
          if (isTransferCategory) {
            rule.matchCount++;
            this.saveRules();
            
            // Boost confidence if multiple factors matched
            let confidenceBoost = 0;
            if (descriptionMatch) confidenceBoost += 0.1;
            if (counterpartyMatch) confidenceBoost += 0.15;
            if (rule.amountStats) confidenceBoost += 0.1;
            
            const confidence = Math.min(
              0.5 + (rule.matchCount * 0.05) + (rule.priority / 200) + confidenceBoost,
              0.99
            );
            return { category: rule.category, confidence };
          }
          
          // Check if category type matches transaction type
          const isExpenseCategory = EXPENSE_CATEGORIES.includes(rule.category as any);
          if (isExpense === isExpenseCategory) {
            // Increase match count for learning
            rule.matchCount++;
            this.saveRules();
            
            // Confidence based on: match count + priority + multi-factor boost
            let confidenceBoost = 0;
            if (descriptionMatch) confidenceBoost += 0.1;
            if (counterpartyMatch) confidenceBoost += 0.15; // Counterparty is strong signal
            if (rule.amountStats) confidenceBoost += 0.1; // Amount learning active
            
            const confidence = Math.min(
              0.5 + (rule.matchCount * 0.05) + (rule.priority / 200) + confidenceBoost,
              0.99
            );
            return { category: rule.category, confidence };
          }
        }
      } catch (e) {
        // Invalid regex, skip
        continue;
      }
    }
    
    // Default category based on transaction type
    return {
      category: isExpense ? 'other_expense' : 'other_income',
      confidence: 0.1,
    };
  }

  async addRule(
    pattern: string, 
    category: Category, 
    isUserDefined = true, 
    minAmount?: number, 
    maxAmount?: number
  ): Promise<CategoryRule> {
    const newRule: CategoryRule = {
      id: `rule_${Date.now()}`,
      pattern,
      category,
      priority: isUserDefined ? 150 : 100, // User rules have higher priority
      matchCount: 0,
      createdAt: new Date().toISOString(),
      isUserDefined,
      minAmount,
      maxAmount,
    };
    
    this.rules.push(newRule);
    await this.saveRules();
    return newRule;
  }

  async learnFromCorrection(
    description: string, 
    correctCategory: Category, 
    amount?: number,
    counterparty?: string
  ): Promise<void> {
    // Extract keywords from description
    const words = description.toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Extract counterparty keywords (sender/receiver)
    const counterpartyWords = counterparty ? counterparty.toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3) : [];
    
    if (words.length === 0 && counterpartyWords.length === 0 && amount === undefined) return;
    
    // Create patterns
    const pattern = words.length > 0 ? words.slice(0, 3).join('|') : '.*';
    const counterpartyPattern = counterpartyWords.length > 0 ? counterpartyWords.slice(0, 2).join('|') : undefined;
    
    // Check if similar rule exists (by category + pattern OR counterparty)
    const existingRule = this.rules.find(r => 
      r.category === correctCategory && (
        words.some(w => r.pattern.includes(w)) ||
        (counterpartyPattern && r.counterpartyPattern && 
         counterpartyWords.some(w => r.counterpartyPattern!.includes(w)))
      )
    );
    
    if (existingRule) {
      // Boost existing rule
      existingRule.priority += 10;
      existingRule.matchCount++;
      
      // Update counterparty pattern if we have new info
      if (counterpartyPattern && !existingRule.counterpartyPattern) {
        existingRule.counterpartyPattern = counterpartyPattern;
      } else if (counterpartyPattern && existingRule.counterpartyPattern) {
        // Merge patterns (avoid duplicates)
        const existingParts = existingRule.counterpartyPattern.split('|');
        const newParts = counterpartyPattern.split('|').filter(p => !existingParts.includes(p));
        if (newParts.length > 0) {
          existingRule.counterpartyPattern = [...existingParts, ...newParts].join('|');
        }
      }
      
      // Dynamic amount learning: Track last N amounts
      if (amount !== undefined) {
        const absAmount = Math.abs(amount);
        
        if (!existingRule.amountStats) {
          existingRule.amountStats = {
            amounts: [absAmount],
            min: absAmount,
            max: absAmount,
            avg: absAmount,
          };
        } else {
          // Keep last 10 amounts for dynamic range calculation
          existingRule.amountStats.amounts.push(absAmount);
          if (existingRule.amountStats.amounts.length > 10) {
            existingRule.amountStats.amounts.shift();
          }
          
          // Recalculate stats
          const amounts = existingRule.amountStats.amounts;
          existingRule.amountStats.min = Math.min(...amounts);
          existingRule.amountStats.max = Math.max(...amounts);
          existingRule.amountStats.avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        }
        
        // Update min/max with 20% tolerance from observed range
        const stats = existingRule.amountStats;
        const range = stats.max - stats.min;
        const tolerance = Math.max(range * 0.2, stats.avg * 0.15); // 20% of range or 15% of avg
        existingRule.minAmount = Math.floor(stats.min - tolerance);
        existingRule.maxAmount = Math.ceil(stats.max + tolerance);
      }
    } else {
      // Create new rule with initial amount stats
      const newRule: CategoryRule = {
        id: `rule_${Date.now()}`,
        pattern,
        counterpartyPattern,
        category: correctCategory,
        priority: 150, // User rules have higher priority
        matchCount: 1,
        createdAt: new Date().toISOString(),
        isUserDefined: true,
      };
      
      // Initialize amount stats if amount provided
      if (amount !== undefined) {
        const absAmount = Math.abs(amount);
        newRule.amountStats = {
          amounts: [absAmount],
          min: absAmount,
          max: absAmount,
          avg: absAmount,
        };
        // Initial range: ±20%
        newRule.minAmount = Math.floor(absAmount * 0.8);
        newRule.maxAmount = Math.ceil(absAmount * 1.2);
      }
      
      this.rules.push(newRule);
    }
    
    await this.saveRules();
  }

  getRules(): CategoryRule[] {
    return [...this.rules];
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.rules = this.rules.filter(r => r.id !== ruleId);
    await this.saveRules();
  }

  async resetToDefaults(): Promise<void> {
    this.rules = DEFAULT_RULES.map((rule, index) => ({
      ...rule,
      id: `default_${index}`,
      createdAt: new Date().toISOString(),
      matchCount: 0,
    }));
    await this.saveRules();
  }

  /**
   * Ensure transfer rules exist (migration for existing users)
   */
  private async ensureTransferRules(): Promise<void> {
    const hasTransferRule = this.rules.some(r => r.category === 'transfer');
    if (!hasTransferRule) {
      // Add transfer rules for existing users
      const transferRules = DEFAULT_RULES.filter(r => r.category === 'transfer');
      for (const rule of transferRules) {
        this.rules.push({
          ...rule,
          id: `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: new Date().toISOString(),
          matchCount: 0,
        });
      }
      await this.saveRules();
    }
  }

  /**
   * Re-categorize all unconfirmed transactions based on current rules
   * Returns transactions that were re-categorized
   */
  recategorizeUnconfirmed(transactions: Transaction[]): Transaction[] {
    const updated: Transaction[] = [];
    
    for (const tx of transactions) {
      // Skip confirmed transactions
      if (tx.isUserConfirmed || tx.isManuallyCategized) {
        continue;
      }
      
      // Re-categorize
      const { category, confidence } = this.categorize(tx.description, tx.amount, tx.counterparty);
      
      // Only update if category changed
      if (category !== tx.category) {
        tx.category = category;
        tx.confidence = confidence;
        // Update type if it's a transfer
        if (category === 'transfer') {
          tx.type = 'transfer';
        } else if (tx.amount >= 0) {
          tx.type = 'income';
        } else {
          tx.type = 'expense';
        }
        updated.push(tx);
      }
    }
    
    return updated;
  }
}

export const categorizationService = new CategorizationService();
