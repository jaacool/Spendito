// File: src/services/aiReview.ts
/**
 * AI Review Service - Categorization Review with Google Gemini
 *
 * Sends uncertain bookings to Gemini and asks for a better category.
 * Falls back to the local rules when no API key is set or the AI fails -
 * in that case the result says so (`source` / `notice`), it never fails silently.
 */

import { Transaction, Category, CATEGORY_INFO, INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES } from '../types';
import { categorizationService } from './categorization';
import { duplicateDetectionService } from './duplicateDetection';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { secureStorageService } from './secureStorage';

// Gemini model used for the review
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
// Bookings per AI request - large prompts get cut off answers
const BATCH_SIZE = 40;

const ALL_CATEGORIES: Category[] = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...TRANSFER_CATEGORIES];

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
  // Where the suggestions come from, so the UI can tell the user honestly
  source: 'ai' | 'rules';
  // German hint for the user, e.g. why the AI was not used
  notice?: string;
}

interface ReviewOutcome {
  results: ReviewResult[];
  source: 'ai' | 'rules';
  notice?: string;
}

function isValidCategory(value: unknown): value is Category {
  return typeof value === 'string' && (ALL_CATEGORIES as string[]).includes(value);
}

class AIReviewService {
  /**
   * Generate the prompt for AI review
   */
  private generateReviewPrompt(transactions: Transaction[]): string {
    const categoryList = ALL_CATEGORIES
      .map(cat => `- ${cat}: ${CATEGORY_INFO[cat].labelDe}`)
      .join('\n');

    const transactionList = transactions.map(t => ({
      id: t.id,
      description: t.description,
      counterparty: t.counterparty,
      amount: t.amount,
      currentCategory: t.category,
      currentCategoryLabel: CATEGORY_INFO[t.category]?.labelDe ?? 'Unbekannt',
    }));

    return `Du bist ein Finanzexperte für einen Hunde-Rettungsverein in Deutschland.
Überprüfe die folgenden Transaktionen und ihre Kategorisierungen.

WICHTIG:
- Deine gesamte Antwort (insbesondere das Feld "reasoning") MUSS auf DEUTSCH sein.
- Verwende in deiner Begründung ("reasoning") immer die DEUTSCHEN Bezeichnungen der Kategorien (z.B. "Tierarzt" statt "veterinary").
- Für "suggestedCategory" darfst du NUR eine der unten genannten IDs verwenden.
- Einnahmen (positiver Betrag) bekommen eine Einnahmen-Kategorie, Ausgaben (negativer Betrag) eine Ausgaben-Kategorie.

Verfügbare Kategorien (ID: Deutsche Bezeichnung):
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
      "reasoning": "Kurze Begründung auf DEUTSCH unter Verwendung der DEUTSCHEN Kategoriebezeichnung",
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
   * Validate one AI answer entry against the booking. Invalid answers are dropped
   * (an invented category used to be saved and crashed the Finanzamt export later).
   */
  private toReviewResult(raw: any, tx: Transaction): ReviewResult | null {
    if (!raw || typeof raw !== 'object' || !isValidCategory(raw.suggestedCategory)) return null;

    // Income must stay income, expense must stay expense (transfer is allowed for both)
    const suggested = raw.suggestedCategory as Category;
    const suggestedIsExpense = (EXPENSE_CATEGORIES as string[]).includes(suggested);
    const suggestedIsIncome = (INCOME_CATEGORIES as string[]).includes(suggested);
    if ((tx.amount < 0 && suggestedIsIncome) || (tx.amount >= 0 && suggestedIsExpense)) return null;

    const confidence = typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.5;
    return {
      transactionId: tx.id,
      originalCategory: tx.category,
      suggestedCategory: suggested,
      confidence,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.slice(0, 500) : '',
      needsReview: raw.needsReview === true && suggested !== tx.category,
    };
  }

  /**
   * Review transactions using Gemini, batch by batch
   */
  async reviewTransactions(transactions: Transaction[]): Promise<ReviewOutcome> {
    const apiKey = await secureStorageService.getApiKey();
    if (!apiKey) {
      return {
        results: this.ruleBasedReview(transactions),
        source: 'rules',
        notice: 'Kein KI-Schlüssel hinterlegt – die Prüfung nutzt die gelernten Regeln. Den Schlüssel kannst du in den Einstellungen eintragen.',
      };
    }

    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const results: ReviewResult[] = [];
      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        const response = await model.generateContent(this.generateReviewPrompt(batch));
        const parsed = JSON.parse(response.response.text());
        const reviews: any[] = Array.isArray(parsed?.reviews) ? parsed.reviews : [];

        for (const tx of batch) {
          const review = this.toReviewResult(reviews.find(r => r?.transactionId === tx.id), tx);
          results.push(review ?? {
            transactionId: tx.id,
            originalCategory: tx.category,
            suggestedCategory: tx.category,
            confidence: 1.0,
            reasoning: 'Keine gültige KI-Empfehlung erhalten.',
            needsReview: false,
          });
        }
      }

      console.log(`[AI Review] Reviewed ${results.length} bookings`);
      return { results, source: 'ai' };
    } catch (error: any) {
      // Log only the error type - never prompt/answer (they contain donor names)
      console.error('[AI Review] Gemini request failed:', error?.name || 'Error', error?.status || '');
      return {
        results: this.ruleBasedReview(transactions),
        source: 'rules',
        notice: this.translateError(error),
      };
    }
  }

  /**
   * Turn technical API errors into a German hint for the user.
   */
  private translateError(error: any): string {
    const message = String(error?.message || '');
    if (/api key|API_KEY|permission|401|403/i.test(message)) {
      return 'Der KI-Schlüssel wurde abgelehnt. Bitte prüfe ihn in den Einstellungen. Es wurden die gelernten Regeln verwendet.';
    }
    if (/quota|429|rate/i.test(message)) {
      return 'Das KI-Kontingent ist gerade aufgebraucht. Bitte später erneut versuchen. Es wurden die gelernten Regeln verwendet.';
    }
    if (/network|fetch|Failed to fetch/i.test(message)) {
      return 'Keine Verbindung zur KI. Bitte Internetverbindung prüfen. Es wurden die gelernten Regeln verwendet.';
    }
    return 'Die KI-Prüfung ist fehlgeschlagen. Es wurden die gelernten Regeln verwendet.';
  }

  /**
   * Rule-based review as fallback when AI is not configured
   */
  private ruleBasedReview(transactions: Transaction[]): ReviewResult[] {
    return transactions
      .filter(t => isValidCategory(t.category))
      .map(t => {
        // Re-categorize using current rules
        const { category: suggestedCategory, confidence } =
          categorizationService.categorize(t.description, t.amount, t.counterparty);

        // Only a real change is a suggestion ("Sonstige Einnahmen -> Sonstige Einnahmen"
        // used to be listed just because the original confidence was low)
        const needsReview =
          suggestedCategory !== t.category &&
          (t.confidence < 0.5 || confidence > 0.7);

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
   * Perform a review of all not yet confirmed bookings of a period
   */
  async performQuarterlyReview(
    transactions: Transaction[],
    quarter: string
  ): Promise<QuarterlyReviewSummary> {
    // Only bookings the user has not decided yet. Internal transfers between bank and
    // PayPal are detected structurally and must not be re-categorized by the AI.
    const transactionsToReview = transactions.filter(t =>
      !t.isManuallyCategized && !t.isUserConfirmed &&
      !t.isDuplicate && !t.isGuthabenTransfer &&
      !duplicateDetectionService.isBankPayPalTransfer(t)
    );

    const outcome = await this.reviewTransactions(transactionsToReview);
    const suggestedChanges = outcome.results.filter(r => r.needsReview);

    return {
      quarter,
      totalTransactions: transactions.length,
      reviewedTransactions: transactionsToReview.length,
      suggestedChanges: suggestedChanges.length,
      appliedChanges: 0, // Will be updated when user applies changes
      results: outcome.results,
      source: outcome.source,
      notice: outcome.notice,
    };
  }

  /**
   * Apply suggested changes. Learning happens inside `onUpdate`
   * (AppContext.updateTransactionCategory) - it used to be learned twice.
   */
  async applySuggestedChanges(
    results: ReviewResult[],
    onUpdate: (id: string, category: Category) => Promise<void>
  ): Promise<number> {
    let appliedCount = 0;

    for (const result of results) {
      if (result.needsReview && result.suggestedCategory !== result.originalCategory) {
        await onUpdate(result.transactionId, result.suggestedCategory);
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
