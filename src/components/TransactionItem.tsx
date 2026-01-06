import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, TouchableOpacity } from 'react-native';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronRight, Check, Building2, Wallet, Link2, CheckCircle2 } from 'lucide-react-native';
import { Transaction, Category, CATEGORY_INFO, INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES, ACCOUNT_INFO } from '../types';

interface TransactionItemProps {
  transaction: Transaction;
  onCategoryChange: (category: Category) => void;
  onConfirm?: () => void;
}

export function TransactionItem({ transaction, onCategoryChange, onConfirm }: TransactionItemProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  
  // Determine verification status
  const isUserConfirmed = transaction.isUserConfirmed || transaction.isManuallyCategized;
  const needsReview = !isUserConfirmed && transaction.confidence < 0.8;
  
  const category = transaction.category || 'other';
  const info = CATEGORY_INFO[category] || { label: 'Other', labelDe: 'Sonstiges', icon: 'circle', color: '#6b7280' };
  const sourceAccount = transaction.sourceAccount || 'volksbank';
  const accountInfo = ACCOUNT_INFO[sourceAccount] || { label: 'Volksbank', color: '#0066b3' };
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer' || transaction.category === 'transfer';
  const isDuplicate = transaction.isDuplicate;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'd. MMM', { locale: de });
  };

  // Show all categories: income, expense, and transfer
  const categories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...TRANSFER_CATEGORIES];

  return (
    <>
      <Pressable
        onPress={() => setShowCategoryPicker(true)}
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
          isDuplicate && styles.duplicateContainer,
          !isUserConfirmed && !isDuplicate && styles.unverifiedContainer,
        ]}
      >
        <View style={styles.leftSection}>
          <View style={[styles.categoryIndicator, { backgroundColor: isDuplicate ? '#d1d5db' : info.color }]} />
          <View style={styles.content}>
            <View style={styles.descriptionRow}>
              <Text style={[styles.description, isDuplicate && styles.duplicateText]} numberOfLines={1}>
                {transaction.description}
              </Text>
              {isDuplicate && (
                <View style={styles.duplicateBadge}>
                  <Link2 size={10} color="#9ca3af" />
                  <Text style={styles.duplicateBadgeText}>Duplikat</Text>
                </View>
              )}
            </View>
            <Text style={[styles.counterparty, isDuplicate && styles.duplicateText]} numberOfLines={1}>
              {transaction.counterparty}
            </Text>
            <View style={styles.metaRow}>
              {/* Account Badge */}
              <View style={[styles.accountBadge, { backgroundColor: accountInfo.color + '15' }]}>
                {sourceAccount === 'volksbank' ? (
                  <Building2 size={10} color={accountInfo.color} />
                ) : (
                  <Wallet size={10} color={accountInfo.color} />
                )}
                <Text style={[styles.accountText, { color: accountInfo.color }]}>
                  {accountInfo.label}
                </Text>
              </View>
              {/* Category Badge */}
              <View style={[styles.categoryBadge, { backgroundColor: info.color + '15' }]}>
                <Text style={[styles.categoryText, { color: info.color }]}>
                  {info.labelDe}
                </Text>
              </View>
              {/* Status Badge - only show for unverified */}
              {!isUserConfirmed && transaction.confidence < 0.7 && (
                <View style={styles.lowConfidenceBadge}>
                  <Text style={styles.lowConfidenceText}>Unsicher</Text>
                </View>
              )}
            </View>
          </View>
        </View>
        
        <View style={styles.rightSection}>
          <View style={styles.amountRow}>
            <Text style={[
              styles.amount, 
              { color: isIncome ? '#22c55e' : '#ef4444' },
              isDuplicate && styles.duplicateAmount
            ]}>
              {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
            </Text>
            {isUserConfirmed && (
              <CheckCircle2 size={14} color="#22c55e" style={styles.verifiedIcon} />
            )}
          </View>
          <Text style={styles.date}>{formatDate(transaction.date)}</Text>
          <ChevronRight size={16} color="#d1d5db" style={styles.chevron} />
        </View>
      </Pressable>

      {/* Category Picker Modal */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowCategoryPicker(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Kategorie ändern</Text>
            <Text style={styles.modalSubtitle}>{transaction.description}</Text>
            
            {categories.map((cat) => {
              const catInfo = CATEGORY_INFO[cat];
              const isSelected = cat === transaction.category;
              
              return (
                <Pressable
                  key={cat}
                  style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                  onPress={() => {
                    onCategoryChange(cat);
                    setShowCategoryPicker(false);
                  }}
                >
                  <View style={[styles.categoryDot, { backgroundColor: catInfo.color }]} />
                  <Text style={styles.categoryOptionText}>{catInfo.labelDe}</Text>
                  {isSelected && <Check size={20} color="#22c55e" />}
                </Pressable>
              );
            })}
            
            {/* Action Buttons */}
            <View style={styles.modalActions}>
              {!isUserConfirmed && onConfirm && (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => {
                    onConfirm();
                    setShowCategoryPicker(false);
                  }}
                >
                  <CheckCircle2 size={18} color="#22c55e" />
                  <Text style={styles.confirmButtonText}>Bestätigen</Text>
                </TouchableOpacity>
              )}
              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowCategoryPicker(false)}
              >
                <Text style={styles.cancelButtonText}>Schließen</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  pressed: {
    backgroundColor: '#f9fafb',
  },
  duplicateContainer: {
    backgroundColor: '#f9fafb',
    opacity: 0.7,
  },
  unverifiedContainer: {
    backgroundColor: '#f8f9fa',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  categoryIndicator: {
    width: 3,
    height: 36,
    borderRadius: 1.5,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  descriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 1,
    flex: 1,
  },
  duplicateText: {
    color: '#9ca3af',
  },
  duplicateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  duplicateBadgeText: {
    fontSize: 8,
    color: '#9ca3af',
    fontWeight: '500',
  },
  counterparty: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  accountText: {
    fontSize: 8,
    fontWeight: '600',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: 9,
    fontWeight: '600',
  },
  lowConfidenceBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  lowConfidenceText: {
    fontSize: 8,
    color: '#d97706',
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 1,
  },
  duplicateAmount: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  date: {
    fontSize: 10,
    color: '#9ca3af',
  },
  chevron: {
    marginTop: 2,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  categoryOptionSelected: {
    backgroundColor: '#ecfdf5',
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  modalActions: {
    marginTop: 12,
    gap: 8,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  verifiedIcon: {
    marginLeft: 2,
  },
});
