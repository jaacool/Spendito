import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react-native';
import { YearSummary } from '../types';

interface SummaryHeaderProps {
  summary: YearSummary;
}

export function SummaryHeader({ summary }: SummaryHeaderProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const isPositive = summary.balance >= 0;

  return (
    <View style={styles.container}>
      {/* Main Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <View style={styles.balanceIconContainer}>
            <Wallet size={18} color="#ffffff" strokeWidth={2} />
          </View>
          <Text style={styles.balanceLabel}>Bilanz {summary.year}</Text>
        </View>
        <Text style={[styles.balanceAmount, { color: isPositive ? '#22c55e' : '#ef4444' }]}>
          {isPositive ? '+' : ''}{formatCurrency(summary.balance)}
        </Text>
      </View>

      {/* Income & Expense Cards */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.incomeCard]}>
          <View style={styles.statHeader}>
            <TrendingUp size={14} color="#22c55e" strokeWidth={2.5} />
            <Text style={styles.statLabel}>Einnahmen</Text>
          </View>
          <Text style={styles.incomeAmount}>+{formatCurrency(summary.totalIncome)}</Text>
        </View>

        <View style={[styles.statCard, styles.expenseCard]}>
          <View style={styles.statHeader}>
            <TrendingDown size={14} color="#ef4444" strokeWidth={2.5} />
            <Text style={styles.statLabel}>Ausgaben</Text>
          </View>
          <Text style={styles.expenseAmount}>-{formatCurrency(summary.totalExpense)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 12,
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  balanceCard: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
  },
  incomeCard: {
    backgroundColor: '#f0fdf4',
  },
  expenseCard: {
    backgroundColor: '#fef2f2',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  incomeAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#22c55e',
  },
  expenseAmount: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ef4444',
  },
});
