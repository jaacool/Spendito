import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Pressable, 
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Dog, TrendingUp, TrendingDown, Building2, Wallet } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { 
  SummaryHeader, 
  CategoryCard, 
  TransactionItem, 
  SideMenu,
  ReviewModal,
  CategoryBar,
  SettingsModal,
} from '../src/components';
import { Category, SourceAccount } from '../src/types';

export default function HomeScreen() {
  const {
    transactions,
    selectedYear,
    availableYears,
    yearSummary,
    isLoading,
    isSideMenuOpen,
    setSelectedYear,
    setSideMenuOpen,
    updateTransactionCategory,
    refreshData,
    loadMockData,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [accountFilter, setAccountFilter] = useState<'all' | SourceAccount>('all');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const filteredTransactions = transactions.filter(t => {
    // Filter by type
    if (activeTab !== 'all' && t.type !== activeTab) return false;
    // Filter by account
    if (accountFilter !== 'all' && t.sourceAccount !== accountFilter) return false;
    // Filter duplicates
    if (!showDuplicates && t.isDuplicate) return false;
    return true;
  });

  // Count duplicates for display
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;

  const handleCategoryChange = async (id: string, category: Category) => {
    await updateTransactionCategory(id, category);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Lade Daten...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable 
          onPress={() => setSideMenuOpen(true)}
          style={styles.menuButton}
        >
          <Menu size={24} color="#1f2937" />
        </Pressable>
        
        <View style={styles.headerCenter}>
          <Dog size={24} color="#0ea5e9" strokeWidth={2} />
          <Text style={styles.headerTitle}>Spendito</Text>
        </View>
        
        <View style={styles.yearBadge}>
          <Text style={styles.yearText}>{selectedYear}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
          />
        }
      >
        {/* Summary Header */}
        {yearSummary && <SummaryHeader summary={yearSummary} />}

        {/* Category Cards */}
        {yearSummary && (
          <View style={styles.categoriesSection}>
            {/* Income Categories */}
            {yearSummary.incomeByCategory.length > 0 && (
              <View style={styles.categorySection}>
                <View style={styles.sectionHeader}>
                  <TrendingUp size={18} color="#22c55e" />
                  <Text style={styles.sectionTitle}>Einnahmen nach Kategorie</Text>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScrollContent}
                  style={styles.categoryScroll}
                >
                  {yearSummary.incomeByCategory.map((cat) => (
                    <CategoryCard
                      key={cat.category}
                      category={cat.category}
                      total={cat.total}
                      count={cat.count}
                      percentage={cat.percentage}
                      type="income"
                    />
                  ))}
                </ScrollView>
                <CategoryBar data={yearSummary.incomeByCategory} height={6} />
              </View>
            )}

            {/* Expense Categories */}
            {yearSummary.expenseByCategory.length > 0 && (
              <View style={styles.categorySection}>
                <View style={styles.sectionHeader}>
                  <TrendingDown size={18} color="#ef4444" />
                  <Text style={styles.sectionTitle}>Ausgaben nach Kategorie</Text>
                </View>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryScrollContent}
                  style={styles.categoryScroll}
                >
                  {yearSummary.expenseByCategory.map((cat) => (
                    <CategoryCard
                      key={cat.category}
                      category={cat.category}
                      total={cat.total}
                      count={cat.count}
                      percentage={cat.percentage}
                      type="expense"
                    />
                  ))}
                </ScrollView>
                <CategoryBar data={yearSummary.expenseByCategory} height={6} />
              </View>
            )}
          </View>
        )}

        {/* Transaction Tabs */}
        <View style={styles.tabsContainer}>
          <Pressable
            style={[styles.tab, activeTab === 'all' && styles.tabActive]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              Alle
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'income' && styles.tabActive]}
            onPress={() => setActiveTab('income')}
          >
            <Text style={[styles.tabText, activeTab === 'income' && styles.tabTextActive]}>
              Einnahmen
            </Text>
          </Pressable>
          <Pressable
            style={[styles.tab, activeTab === 'expense' && styles.tabActive]}
            onPress={() => setActiveTab('expense')}
          >
            <Text style={[styles.tabText, activeTab === 'expense' && styles.tabTextActive]}>
              Ausgaben
            </Text>
          </Pressable>
        </View>

        {/* Account Filter */}
        <View style={styles.accountFilterContainer}>
          <Pressable
            style={[styles.accountFilterButton, accountFilter === 'all' && styles.accountFilterActive]}
            onPress={() => setAccountFilter('all')}
          >
            <Text style={[styles.accountFilterText, accountFilter === 'all' && styles.accountFilterTextActive]}>
              Alle
            </Text>
          </Pressable>
          <Pressable
            style={[styles.accountFilterButton, accountFilter === 'volksbank' && styles.accountFilterActive]}
            onPress={() => setAccountFilter('volksbank')}
          >
            <Building2 size={12} color={accountFilter === 'volksbank' ? '#0066b3' : '#6b7280'} />
            <Text style={[styles.accountFilterText, accountFilter === 'volksbank' && { color: '#0066b3' }]}>
              Volksbank
            </Text>
          </Pressable>
          <Pressable
            style={[styles.accountFilterButton, accountFilter === 'paypal' && styles.accountFilterActive]}
            onPress={() => setAccountFilter('paypal')}
          >
            <Wallet size={12} color={accountFilter === 'paypal' ? '#003087' : '#6b7280'} />
            <Text style={[styles.accountFilterText, accountFilter === 'paypal' && { color: '#003087' }]}>
              PayPal
            </Text>
          </Pressable>
        </View>

        {/* Duplicate Toggle */}
        {duplicateCount > 0 && (
          <Pressable 
            style={styles.duplicateToggle}
            onPress={() => setShowDuplicates(!showDuplicates)}
          >
            <Text style={styles.duplicateToggleText}>
              {showDuplicates ? 'Duplikate ausblenden' : `${duplicateCount} Duplikate anzeigen`}
            </Text>
          </Pressable>
        )}

        {/* Transactions List */}
        <View style={styles.transactionsContainer}>
          <Text style={styles.transactionsTitle}>
            {filteredTransactions.length} Buchungen
          </Text>
          
          <View style={styles.transactionsList}>
            {filteredTransactions.map((transaction) => (
              <TransactionItem
                key={transaction.id}
                transaction={transaction}
                onCategoryChange={(category) => handleCategoryChange(transaction.id, category)}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Side Menu */}
      <SideMenu
        isOpen={isSideMenuOpen}
        onClose={() => setSideMenuOpen(false)}
        selectedYear={selectedYear}
        availableYears={availableYears}
        onYearSelect={setSelectedYear}
        onReloadData={loadMockData}
        onOpenReview={() => setIsReviewOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* AI Review Modal */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        transactions={transactions}
        onApplyChange={updateTransactionCategory}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8f4fc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8f4fc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e8f4fc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  yearBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  yearText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  categoriesSection: {
    // Container for all category sections
  },
  categorySection: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  categoryScroll: {
    // Horizontal scroll
  },
  categoryScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: '#e8f4fc',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: '#1f2937',
    fontWeight: '600',
  },
  accountFilterContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  accountFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  accountFilterActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  accountFilterText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280',
  },
  accountFilterTextActive: {
    color: '#0ea5e9',
  },
  duplicateToggle: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    alignItems: 'center',
  },
  duplicateToggleText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#d97706',
  },
  transactionsContainer: {
    marginHorizontal: 16,
  },
  transactionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transactionsList: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
});
