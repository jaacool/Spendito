// File: src/components/home/TransactionList.tsx
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { Category, CATEGORY_INFO, Transaction } from '../../types';
import { TransactionItem } from '../TransactionItem';
import { homeStyles as styles } from './homeStyles';

interface TransactionListProps {
  transactions: Transaction[];
  selectedCategory: Category | null;
  onClearCategory: () => void;
  onCategoryChange: (id: string, category: Category) => Promise<void>;
  onConfirm: (id: string) => Promise<void>;
  onError: (message: string) => void;
}

/**
 * Booking count, active category filter and the list of TransactionItems.
 */
export function TransactionList({
  transactions,
  selectedCategory,
  onClearCategory,
  onCategoryChange,
  onConfirm,
  onError,
}: TransactionListProps) {
  return (
    <View style={styles.transactionsContainer}>
      <Text style={styles.transactionsTitle}>
        {transactions.length} Buchungen
      </Text>

      {/* Category Filter Badge */}
      {selectedCategory && (
        <View style={styles.categoryFilterBadge}>
          <Text style={styles.categoryFilterText}>
            Gefiltert nach: {CATEGORY_INFO[selectedCategory]?.labelDe || selectedCategory}
          </Text>
          <Pressable onPress={onClearCategory} style={styles.categoryFilterClose}>
            <X size={14} color="#6b7280" />
          </Pressable>
        </View>
      )}

      <View style={styles.transactionsList}>
        {transactions.map(transaction => (
          <TransactionItem
            key={transaction.id}
            transaction={transaction}
            onCategoryChange={category => onCategoryChange(transaction.id, category)}
            onConfirm={() => onConfirm(transaction.id)}
            onError={onError}
          />
        ))}
      </View>
    </View>
  );
}
