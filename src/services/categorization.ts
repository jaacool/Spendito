import AsyncStorage from '@react-native-async-storage/async-storage';
import { Category, CategoryRule, Transaction, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../types';
import { supabase, SUPABASE_TABLES, isSupabaseConfigured } from './supabase';

const RULES_STORAGE_KEY = '@spendito_category_rules';
const USER_ID_KEY = 'backend_user_id'; // Reuse the same user ID as backendApi

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

  async initialize(force = false): Promise<void> {
    if (this.initialized && !force) return;
    
    try {
      // 1. Try to load local rules first
      const stored = await AsyncStorage.getItem(RULES_STORAGE_KEY);
      if (stored && !force) {
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

      // 2. Try to sync with Supabase if userId exists
      const userId = await AsyncStorage.getItem(USER_ID_KEY);
      if (userId) {
        await this.syncWithSupabase(userId);
      }
    } catch (error) {
      console.error('Failed to load categorization rules:', error);
      this.rules = [];
    }
    
    this.initialized = true;
  }

  private async syncWithSupabase(userId: string): Promise<void> {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLES.CATEGORY_RULES)
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      if (data && data.length > 0) {
        // Merge or replace rules. For now, we replace with remote if remote exists
        // as remote is the source of truth for multi-device
        this.rules = data.map(r => ({
          id: r.id,
          pattern: r.pattern,
          category: r.category as Category,
          priority: r.priority,
          matchCount: r.match_count,
          createdAt: r.created_at,
          isUserDefined: r.is_user_defined,
          minAmount: r.min_amount,
          maxAmount: r.max_amount,
        }));
        await AsyncStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(this.rules));
        console.log(`[Categorization] Synced ${this.rules.length} rules from Supabase`);
      }
    } catch (error) {
      console.error('[Categorization] Supabase sync failed:', error);
    }
  }

  private async saveRules(): Promise<void> {
    try {
      await AsyncStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(this.rules));
      
      // Sync to Supabase if userId exists and Supabase is configured
      const userId = await AsyncStorage.getItem(USER_ID_KEY);
      if (userId && isSupabaseConfigured) {
        const rulesToSync = this.rules.map(r => ({
          id: r.id,
          user_id: userId,
          pattern: r.pattern,
          category: r.category,
          priority: r.priority,
          match_count: r.matchCount,
          is_user_defined: r.isUserDefined,
          min_amount: r.minAmount,
          max_amount: r.maxAmount,
          created_at: r.createdAt,
        }));

        const { error } = await supabase
          .from(SUPABASE_TABLES.CATEGORY_RULES)
          .upsert(rulesToSync);

        if (error) console.error('[Categorization] Failed to push rules to Supabase:', error);
      }
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
            // Check amount range if specified
            if (rule.minAmount !== undefined && Math.abs(amount) < rule.minAmount) continue;
            if (rule.maxAmount !== undefined && Math.abs(amount) > rule.maxAmount) continue;

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

  async learnFromCorrection(description: string, correctCategory: Category, amount?: number): Promise<void> {
    // Extract keywords from description for new rule
    const words = description.toLowerCase()
      .replace(/[^a-zäöüß\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    if (words.length === 0 && amount === undefined) return;
    
    // Create pattern from significant words
    const pattern = words.length > 0 ? words.slice(0, 3).join('|') : '.*';
    
    // Define amount range (e.g., +/- 10%)
    let minAmt: number | undefined;
    let maxAmt: number | undefined;
    
    if (amount !== undefined) {
      const absAmount = Math.abs(amount);
      minAmt = Math.floor(absAmount * 0.9);
      maxAmt = Math.ceil(absAmount * 1.1);
      
      // Special case for Protection Fee (Schutzgebühr) around 500
      if (correctCategory === 'protection_fee' && absAmount >= 400 && absAmount <= 600) {
        minAmt = 400;
        maxAmt = 600;
      }
    }
    
    // Check if similar rule exists
    const existingRule = this.rules.find(r => 
      r.category === correctCategory && 
      (words.some(w => r.pattern.includes(w)) || (amount !== undefined && r.minAmount !== undefined))
    );
    
    if (existingRule) {
      // Boost existing rule
      existingRule.priority += 10;
      existingRule.matchCount++;
      
      // Update amount range if it's more specific now
      if (amount !== undefined) {
        existingRule.minAmount = existingRule.minAmount ? Math.min(existingRule.minAmount, minAmt!) : minAmt;
        existingRule.maxAmount = existingRule.maxAmount ? Math.max(existingRule.maxAmount, maxAmt!) : maxAmt;
      }
    } else {
      // Create new rule
      await this.addRule(pattern, correctCategory, true, minAmt, maxAmt);
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
