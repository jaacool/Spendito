import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, CategoryRule, Transaction, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../types';

const RULES_STORAGE_KEY = '@spendito_category_rules';

// Default rules for initial categorization
const DEFAULT_RULES: Omit<CategoryRule, 'id' | 'createdAt' | 'matchCount'>[] = [
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

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(RULES_STORAGE_KEY);
      if (stored) {
        this.rules = JSON.parse(stored);
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

  categorize(description: string, amount: number): { category: Category; confidence: number } {
    const normalizedDesc = description.toLowerCase();
    const isExpense = amount < 0;
    
    // Sort rules by priority (highest first)
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(normalizedDesc)) {
          // Check if category type matches transaction type
          const isExpenseCategory = EXPENSE_CATEGORIES.includes(rule.category as any);
          if (isExpense === isExpenseCategory) {
            // Increase match count for learning
            rule.matchCount++;
            this.saveRules();
            
            // Confidence based on match count and priority
            const confidence = Math.min(0.5 + (rule.matchCount * 0.05) + (rule.priority / 200), 0.99);
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

  async addRule(pattern: string, category: Category, isUserDefined = true): Promise<CategoryRule> {
    const newRule: CategoryRule = {
      id: `rule_${Date.now()}`,
      pattern,
      category,
      priority: isUserDefined ? 150 : 100, // User rules have higher priority
      matchCount: 0,
      createdAt: new Date().toISOString(),
      isUserDefined,
    };
    
    this.rules.push(newRule);
    await this.saveRules();
    return newRule;
  }

  async learnFromCorrection(description: string, correctCategory: Category): Promise<void> {
    // Extract keywords from description for new rule
    const words = description.toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    if (words.length === 0) return;
    
    // Create pattern from significant words
    const pattern = words.slice(0, 3).join('|');
    
    // Check if similar rule exists
    const existingRule = this.rules.find(r => 
      r.category === correctCategory && 
      words.some(w => r.pattern.includes(w))
    );
    
    if (existingRule) {
      // Boost existing rule
      existingRule.priority += 10;
      existingRule.matchCount++;
    } else {
      // Create new rule
      await this.addRule(pattern, correctCategory, true);
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
}

export const categorizationService = new CategorizationService();
