/**
 * AI Review Service - Quarterly Categorization Review
 * 
 * This service prepares the integration with an AI API (e.g., OpenAI, Claude)
 * to review and correct transaction categorizations on a quarterly basis.
 */

import { Transaction, Category, CATEGORY_INFO, INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES } from '../types';
import { categorizationService } from './categorization';
import { GoogleGenerativeAI } from '@google/generative-ai';

// In a real app, this should be in an environment variable or secure storage
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface ReviewResult {
  transactionId: string;
  originalCategory: Category;
  suggestedCategory: Category;
  confidence: number;
  reasoning: string;
  needsReview: boolean;
}

export interface QuarterlyReviewSummary {
  quarter: string; // e.g., "Q4 2024"
  totalTransactions: number;
  reviewedTransactions: number;
  suggestedChanges: number;
  appliedChanges: number;
  results: ReviewResult[];
}

interface AIReviewConfig {
  apiKey: string;
  model: string;
  endpoint?: string;
}

class AIReviewService {
  private config: AIReviewConfig | null = null;

  /**
   * Configure the AI service
   */
  configure(config: AIReviewConfig): void {
    this.config = config;
    console.log('AI Review Service configured with model:', config.model);
  }

  /**
   * Generate the prompt for AI review
   */
  private generateReviewPrompt(transactions: Transaction[]): string {
    const categoryList = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...TRANSFER_CATEGORIES]
      .map(cat => `- ${cat}: ${CATEGORY_INFO[cat].labelDe}`)
      .join('\n');

    const transactionList = transactions
      .filter(t => t.category && CATEGORY_INFO[t.category]) // Filter out invalid categories
      .map(t => ({
        id: t.id,
        description: t.description,
        counterparty: t.counterparty,
        amount: t.amount,
        currentCategory: t.category,
        currentCategoryLabel: CATEGORY_INFO[t.category].labelDe,
      }));

    return `Du bist ein Finanzexperte für einen Hunde-Rettungsverein. 
Überprüfe die folgenden Transaktionen und ihre Kategorisierungen.

Verfügbare Kategorien:
${categoryList}

Transaktionen zur Überprüfung:
${JSON.stringify(transactionList, null, 2)}

Für jede Transaktion, antworte im JSON-Format:
{
  "reviews": [
    {
      "transactionId": "...",
      "suggestedCategory": "...",
      "confidence": 0.0-1.0,
      "reasoning": "Kurze Begründung",
      "needsReview": true/false
    }
  ]
}

Setze needsReview auf true, wenn:
- Die aktuelle Kategorie falsch erscheint
- Die Beschreibung mehrdeutig ist
- Du dir unsicher bist

Behalte die aktuelle Kategorie bei, wenn sie korrekt erscheint.`;
  }

  /**
   * Review transactions using AI (Gemini 1.5 Flash)
   */
  async reviewTransactions(transactions: Transaction[]): Promise<ReviewResult[]> {
    console.log('[AI Review] Starting review for', transactions.length, 'transactions');
    console.log('[AI Review] API Key present:', !!GEMINI_API_KEY);
    console.log('[AI Review] API Key length:', GEMINI_API_KEY?.length || 0);
    
    if (!GEMINI_API_KEY) {
      console.warn('[AI Review] Gemini API Key missing (EXPO_PUBLIC_GEMINI_API_KEY). Using rule-based review.');
      return this.ruleBasedReview(transactions);
    }

    try {
      console.log('[AI Review] Initializing Gemini model...');
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      console.log('[AI Review] Generating prompt...');
      const prompt = this.generateReviewPrompt(transactions);
      console.log('[AI Review] Prompt length:', prompt.length);
      
      console.log('[AI Review] Calling Gemini API...');
      const result = await model.generateContent(prompt);
      console.log('[AI Review] API call successful, parsing response...');
      
      const response = await result.response;
      const text = response.text();
      console.log('[AI Review] Response received, length:', text.length);
      
      const parsedData = JSON.parse(text);
      console.log('[AI Review] Parsed', parsedData.reviews?.length || 0, 'review results');
      
      return this.mergeAIResults(parsedData.reviews, transactions);
    } catch (error) {
      console.error('[AI Review] Gemini API call failed:', error);
      console.error('[AI Review] Error details:', JSON.stringify(error, null, 2));
      return this.ruleBasedReview(transactions);
    }
  }

  /**
   * Merge AI suggestions with original transactions
   */
  private mergeAIResults(aiReviews: any[], originalTransactions: Transaction[]): ReviewResult[] {
    return originalTransactions.map(t => {
      const aiReview = aiReviews.find(r => r.transactionId === t.id);
      
      if (!aiReview) {
        return {
          transactionId: t.id,
          originalCategory: t.category,
          suggestedCategory: t.category,
          confidence: 1.0,
          reasoning: 'Keine KI-Empfehlung verfügbar.',
          needsReview: false,
        };
      }

      return {
        transactionId: t.id,
        originalCategory: t.category,
        suggestedCategory: aiReview.suggestedCategory as Category,
        confidence: aiReview.confidence,
        reasoning: aiReview.reasoning,
        needsReview: aiReview.needsReview,
      };
    });
  }

  /**
   * Rule-based review as fallback when AI is not configured
   */
  private ruleBasedReview(transactions: Transaction[]): ReviewResult[] {
    console.log('[AI Review] Using rule-based fallback for', transactions.length, 'transactions');
    return transactions
      .filter(t => t.category && CATEGORY_INFO[t.category]) // Filter out invalid categories
      .map(t => {
        // Re-categorize using current rules
        const { category: suggestedCategory, confidence } = 
          categorizationService.categorize(t.description, t.amount, t.counterparty);

        const needsReview = 
          t.confidence < 0.5 || // Low confidence original categorization
          (suggestedCategory !== t.category && confidence > 0.7); // Different suggestion with high confidence

        return {
          transactionId: t.id,
          originalCategory: t.category,
          suggestedCategory: needsReview ? suggestedCategory : t.category,
          confidence,
          reasoning: needsReview 
            ? `Basierend auf "${t.description}" könnte ${CATEGORY_INFO[suggestedCategory].labelDe} passender sein.`
            : 'Kategorisierung erscheint korrekt.',
          needsReview,
        };
      });
  }

  /**
   * Perform quarterly review - analyzes ALL transactions
   */
  async performQuarterlyReview(
    transactions: Transaction[],
    quarter: string
  ): Promise<QuarterlyReviewSummary> {
    console.log('[AI Review] Starting quarterly review for', quarter);
    console.log('[AI Review] Total transactions:', transactions.length);
    
    // Filter transactions that are not yet confirmed by user
    const transactionsToReview = transactions.filter(t => 
      !t.isManuallyCategized && !t.isUserConfirmed
    );
    
    console.log('[AI Review] Transactions to review:', transactionsToReview.length);

    const results = await this.reviewTransactions(transactionsToReview);
    const suggestedChanges = results.filter(r => r.needsReview);

    return {
      quarter,
      totalTransactions: transactions.length,
      reviewedTransactions: transactionsToReview.length,
      suggestedChanges: suggestedChanges.length,
      appliedChanges: 0, // Will be updated when user applies changes
      results,
    };
  }

  /**
   * Apply suggested changes from review and LEARN from them
   */
  async applySuggestedChanges(
    results: ReviewResult[],
    allTransactions: Transaction[],
    onUpdate: (id: string, category: Category) => Promise<void>
  ): Promise<number> {
    let appliedCount = 0;

    for (const result of results) {
      if (result.needsReview && result.suggestedCategory !== result.originalCategory) {
        // Find the full transaction to get description and amount for learning
        const transaction = allTransactions.find(t => t.id === result.transactionId);
        
        await onUpdate(result.transactionId, result.suggestedCategory);
        
        // LEARN from the AI correction
        if (transaction) {
          await categorizationService.learnFromCorrection(
            transaction.description,
            result.suggestedCategory,
            transaction.amount,
            transaction.counterparty
          );
        }
        
        appliedCount++;
      }
    }

    return appliedCount;
  }

  /**
   * Get current quarter string
   */
  static getCurrentQuarter(): string {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `Q${quarter} ${now.getFullYear()}`;
  }

  /**
   * Check if it's time for quarterly review
   */
  static isQuarterlyReviewDue(lastReviewDate: Date | null): boolean {
    if (!lastReviewDate) return true;

    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const lastQuarter = Math.floor(lastReviewDate.getMonth() / 3);
    const yearDiff = now.getFullYear() - lastReviewDate.getFullYear();

    return yearDiff > 0 || currentQuarter > lastQuarter;
  }
}

export const aiReviewService = new AIReviewService();

/**
 * AI Integration Notes:
 * 
 * For production AI integration:
 * 
 * 1. OpenAI Integration:
 *    aiReviewService.configure({
 *      apiKey: process.env.OPENAI_API_KEY,
 *      model: 'gpt-4',
 *      endpoint: 'https://api.openai.com/v1/chat/completions',
 *    });
 * 
 * 2. Claude Integration:
 *    aiReviewService.configure({
 *      apiKey: process.env.ANTHROPIC_API_KEY,
 *      model: 'claude-3-opus-20240229',
 *      endpoint: 'https://api.anthropic.com/v1/messages',
 *    });
 * 
 * 3. Security:
 *    - Store API keys securely (environment variables, secure storage)
 *    - Consider using a backend proxy to hide API keys
 *    - Implement rate limiting
 * 
 * 4. Cost optimization:
 *    - Batch transactions for review
 *    - Only review uncertain categorizations
 *    - Cache results to avoid duplicate API calls
 */
