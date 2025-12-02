import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X, Sparkles, Check, AlertCircle, ChevronRight } from 'lucide-react-native';
import { Transaction, Category, CATEGORY_INFO } from '../types';
import { aiReviewService, ReviewResult, QuarterlyReviewSummary } from '../services/aiReview';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  onApplyChange: (id: string, category: Category) => Promise<void>;
}

export function ReviewModal({ isOpen, onClose, transactions, onApplyChange }: ReviewModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<QuarterlyReviewSummary | null>(null);
  const [appliedChanges, setAppliedChanges] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && !summary) {
      performReview();
    }
  }, [isOpen]);

  const performReview = async () => {
    setIsLoading(true);
    try {
      const quarter = aiReviewService.constructor.prototype.constructor.getCurrentQuarter 
        ? (aiReviewService.constructor as any).getCurrentQuarter()
        : `Q${Math.floor(new Date().getMonth() / 3) + 1} ${new Date().getFullYear()}`;
      
      const result = await aiReviewService.performQuarterlyReview(transactions, quarter);
      setSummary(result);
    } catch (error) {
      console.error('Review failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyChange = async (result: ReviewResult) => {
    if (result.suggestedCategory !== result.originalCategory) {
      await onApplyChange(result.transactionId, result.suggestedCategory);
      setAppliedChanges(prev => new Set([...prev, result.transactionId]));
    }
  };

  const handleApplyAll = async () => {
    if (!summary) return;
    
    const toApply = summary.results.filter(r => 
      r.needsReview && 
      r.suggestedCategory !== r.originalCategory &&
      !appliedChanges.has(r.transactionId)
    );

    for (const result of toApply) {
      await handleApplyChange(result);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(Math.abs(amount));
  };

  const suggestionsToReview = summary?.results.filter(r => 
    r.needsReview && !appliedChanges.has(r.transactionId)
  ) || [];

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconContainer}>
                <Sparkles size={24} color="#8b5cf6" />
              </View>
              <View>
                <Text style={styles.title}>KI-Überprüfung</Text>
                <Text style={styles.subtitle}>
                  {summary?.quarter || 'Quartalsweise Kategorieprüfung'}
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#6b7280" />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8b5cf6" />
              <Text style={styles.loadingText}>Analysiere Transaktionen...</Text>
            </View>
          ) : summary ? (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Summary Stats */}
              <View style={styles.statsContainer}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{summary.totalTransactions}</Text>
                  <Text style={styles.statLabel}>Gesamt</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{summary.reviewedTransactions}</Text>
                  <Text style={styles.statLabel}>Geprüft</Text>
                </View>
                <View style={[styles.statCard, styles.highlightCard]}>
                  <Text style={[styles.statValue, styles.highlightValue]}>
                    {suggestionsToReview.length}
                  </Text>
                  <Text style={styles.statLabel}>Vorschläge</Text>
                </View>
              </View>

              {/* Suggestions */}
              {suggestionsToReview.length > 0 ? (
                <>
                  <View style={styles.sectionHeader}>
                    <AlertCircle size={18} color="#f59e0b" />
                    <Text style={styles.sectionTitle}>Änderungsvorschläge</Text>
                  </View>

                  {suggestionsToReview.map((result) => {
                    const transaction = transactions.find(t => t.id === result.transactionId);
                    if (!transaction) return null;

                    const originalInfo = CATEGORY_INFO[result.originalCategory];
                    const suggestedInfo = CATEGORY_INFO[result.suggestedCategory];

                    return (
                      <View key={result.transactionId} style={styles.suggestionCard}>
                        <View style={styles.suggestionHeader}>
                          <Text style={styles.suggestionDescription} numberOfLines={1}>
                            {transaction.description}
                          </Text>
                          <Text style={styles.suggestionAmount}>
                            {formatCurrency(transaction.amount)}
                          </Text>
                        </View>

                        <View style={styles.categoryChange}>
                          <View style={[styles.categoryBadge, { backgroundColor: originalInfo.color + '20' }]}>
                            <View style={[styles.categoryDot, { backgroundColor: originalInfo.color }]} />
                            <Text style={[styles.categoryText, { color: originalInfo.color }]}>
                              {originalInfo.labelDe}
                            </Text>
                          </View>
                          <ChevronRight size={16} color="#9ca3af" />
                          <View style={[styles.categoryBadge, { backgroundColor: suggestedInfo.color + '20' }]}>
                            <View style={[styles.categoryDot, { backgroundColor: suggestedInfo.color }]} />
                            <Text style={[styles.categoryText, { color: suggestedInfo.color }]}>
                              {suggestedInfo.labelDe}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.reasoning}>{result.reasoning}</Text>

                        <Pressable
                          style={styles.applyButton}
                          onPress={() => handleApplyChange(result)}
                        >
                          <Check size={16} color="#ffffff" />
                          <Text style={styles.applyButtonText}>Übernehmen</Text>
                        </Pressable>
                      </View>
                    );
                  })}

                  {/* Apply All Button */}
                  <Pressable style={styles.applyAllButton} onPress={handleApplyAll}>
                    <Sparkles size={18} color="#ffffff" />
                    <Text style={styles.applyAllText}>
                      Alle {suggestionsToReview.length} Vorschläge übernehmen
                    </Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.emptyState}>
                  <Check size={48} color="#22c55e" />
                  <Text style={styles.emptyTitle}>Alles korrekt!</Text>
                  <Text style={styles.emptyText}>
                    Alle Kategorisierungen sehen gut aus. Keine Änderungen vorgeschlagen.
                  </Text>
                </View>
              )}

              {/* Applied Changes */}
              {appliedChanges.size > 0 && (
                <View style={styles.appliedSection}>
                  <Text style={styles.appliedText}>
                    ✓ {appliedChanges.size} Änderungen übernommen
                  </Text>
                </View>
              )}
            </ScrollView>
          ) : (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Fehler beim Laden der Überprüfung</Text>
              <Pressable style={styles.retryButton} onPress={performReview}>
                <Text style={styles.retryText}>Erneut versuchen</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#f3e8ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  highlightCard: {
    backgroundColor: '#fef3c7',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
  },
  highlightValue: {
    color: '#d97706',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  suggestionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionDescription: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1f2937',
    marginRight: 12,
  },
  suggestionAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  categoryChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reasoning: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  applyAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 20,
    gap: 8,
  },
  applyAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  appliedSection: {
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  appliedText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#22c55e',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
});
