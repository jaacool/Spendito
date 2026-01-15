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
  useWindowDimensions,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Dog, TrendingUp, TrendingDown, Building2, Wallet, Settings, BrainCircuit, Search, X } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { isDesktop } from '../src/services/platform';
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
    confirmTransaction,
    refreshData,
    loadMockData,
  } = useApp();

  const { width } = useWindowDimensions();
  const desktopMode = isDesktop(width);

  const [activeTab, setActiveTab] = useState<'all' | 'income' | 'expense'>('all');
  const [accountFilter, setAccountFilter] = useState<'all' | SourceAccount>('all');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const filteredTransactions = transactions
    .filter(t => {
      // Filter by type
      if (activeTab !== 'all' && t.type !== activeTab) return false;
      // Filter by account (with fallback for old transactions)
      const txAccount = t.sourceAccount || 'volksbank';
      if (accountFilter !== 'all' && txAccount !== accountFilter) return false;
      
      // In "Kombi" view (all accounts), hide duplicates and Guthaben-Transfers automatically
      // In single account views, show everything (user can toggle duplicates manually)
      if (accountFilter === 'all') {
        // Always hide duplicates in Kombi view (unless explicitly showing them)
        if (!showDuplicates && (t.isDuplicate || t.isGuthabenTransfer)) return false;
      } else {
        // In single account view, respect the showDuplicates toggle
        if (!showDuplicates && t.isDuplicate) return false;
      }
      
      // Filter only open/unverified transactions
      if (showOnlyOpen && (t.isUserConfirmed || t.isManuallyCategized)) return false;
      
      // Search filter - matches amount or description/counterparty
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        // Check if query is a number (amount search)
        const numericQuery = parseFloat(query.replace(',', '.'));
        if (!isNaN(numericQuery)) {
          // Search by amount (absolute value)
          if (Math.abs(t.amount) !== numericQuery && 
              !Math.abs(t.amount).toString().includes(query)) {
            return false;
          }
        } else {
          // Search by description or counterparty
          const matchesDescription = t.description.toLowerCase().includes(query);
          const matchesCounterparty = t.counterparty.toLowerCase().includes(query);
          if (!matchesDescription && !matchesCounterparty) return false;
        }
      }
      
      return true;
    })
    // Sort by date, newest first
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Count duplicates and open transactions for display
  const duplicateCount = transactions.filter(t => t.isDuplicate).length;
  const openCount = transactions.filter(t => !t.isUserConfirmed && !t.isManuallyCategized && !t.isDuplicate).length;

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
        
        <View style={styles.headerRight}>
          <View style={styles.yearBadge}>
            <Text style={styles.yearText}>{selectedYear}</Text>
          </View>
          
          {desktopMode && (
            <View style={styles.desktopActions}>
              <Pressable 
                onPress={() => setIsReviewOpen(true)}
                style={styles.iconButton}
              >
                <BrainCircuit size={20} color="#0ea5e9" />
              </Pressable>
              <Pressable 
                onPress={() => setIsSettingsOpen(true)}
                style={styles.iconButton}
              >
                <Settings size={20} color="#6b7280" />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <View style={styles.mainContent}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            desktopMode && styles.desktopScrollContent
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0ea5e9"
            />
          }
        >
          <View style={desktopMode ? styles.desktopTwoColumn : null}>
            {/* Left Column: Transactions */}
            <View style={desktopMode ? styles.desktopTransactionsColumn : null}>
              {/* Mobile: Summary Header and Categories (moved here) */}
              {!desktopMode && yearSummary && (
                <>
                  <SummaryHeader summary={yearSummary} />
                  <View style={styles.categoriesSection}>
                    {/* Income Categories */}
                    {yearSummary.incomeByCategory.length > 0 && (
                      <View style={styles.categorySection}>
                        <View style={styles.sectionHeader}>
                          <TrendingUp size={18} color="#22c55e" />
                          <Text style={styles.sectionTitle}>Einnahmen</Text>
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
                          <Text style={styles.sectionTitle}>Ausgaben</Text>
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
                </>
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
                    Kombi
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

              {/* Search Bar */}
              {showSearch ? (
                <View style={styles.searchContainer}>
                  <Search size={18} color="#9ca3af" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Suche nach Betrag (z.B. 500) oder Text..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus
                  />
                  <Pressable 
                    onPress={() => { setShowSearch(false); setSearchQuery(''); }}
                    style={styles.searchCloseButton}
                  >
                    <X size={18} color="#6b7280" />
                  </Pressable>
                </View>
              ) : (
                <Pressable 
                  style={styles.searchButton}
                  onPress={() => setShowSearch(true)}
                >
                  <Search size={16} color="#6b7280" />
                  <Text style={styles.searchButtonText}>Suchen...</Text>
                </Pressable>
              )}

              {/* Filter Toggles */}
              <View style={styles.filterToggles}>
                {/* Open Transactions Toggle */}
                {openCount > 0 && (
                  <Pressable 
                    style={[styles.filterToggle, showOnlyOpen && styles.filterToggleActive]}
                    onPress={() => setShowOnlyOpen(!showOnlyOpen)}
                  >
                    <Text style={[styles.filterToggleText, showOnlyOpen && styles.filterToggleTextActive]}>
                      {showOnlyOpen ? 'Alle anzeigen' : `${openCount} offen`}
                    </Text>
                  </Pressable>
                )}
                
                {/* Duplicate Toggle */}
                {duplicateCount > 0 && (
                  <Pressable 
                    style={styles.duplicateToggle}
                    onPress={() => setShowDuplicates(!showDuplicates)}
                  >
                    <Text style={styles.duplicateToggleText}>
                      {showDuplicates ? 'Duplikate ausblenden' : `${duplicateCount} Duplikate`}
                    </Text>
                  </Pressable>
                )}
              </View>

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
                      onConfirm={() => confirmTransaction(transaction.id)}
                    />
                  ))}
                </View>
              </View>
            </View>

            {/* Right Column: Summary and Categories */}
            {desktopMode && yearSummary && (
              <View style={styles.desktopCategoriesColumn}>
                <View style={styles.desktopCategoriesFixed}>
                  {/* Desktop: Summary Header moved here */}
                  <SummaryHeader summary={yearSummary} />

                  <View style={styles.categoriesSection}>
                    {/* Income Categories */}
                    {yearSummary.incomeByCategory.length > 0 && (
                      <View style={styles.categorySection}>
                        <View style={styles.sectionHeader}>
                          <TrendingUp size={18} color="#22c55e" />
                          <Text style={styles.sectionTitle}>Einnahmen</Text>
                        </View>
                        <View style={styles.desktopCategoryGrid}>
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
                        </View>
                        <CategoryBar data={yearSummary.incomeByCategory} height={6} />
                      </View>
                    )}

                    {/* Expense Categories */}
                    {yearSummary.expenseByCategory.length > 0 && (
                      <View style={[styles.categorySection, { marginTop: 24 }]}>
                        <View style={styles.sectionHeader}>
                          <TrendingDown size={18} color="#ef4444" />
                          <Text style={styles.sectionTitle}>Ausgaben</Text>
                        </View>
                        <View style={styles.desktopCategoryGrid}>
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
                        </View>
                        <CategoryBar data={yearSummary.expenseByCategory} height={6} />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* Side Menu (Mobile and Desktop Drawer) */}
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
        onApplyChange={updateTransactionCategory}
        selectedYear={selectedYear}
        availableYears={availableYears}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  desktopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#f3f4f6',
    paddingLeft: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopSidebar: {
    width: 240,
    backgroundColor: '#ffffff',
    borderRightWidth: 1,
    borderRightColor: '#f3f4f6',
    padding: 16,
  },
  sidebarSection: {
    marginBottom: 24,
  },
  sidebarTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginBottom: 24,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  yearOptionActive: {
    backgroundColor: '#0ea5e9',
  },
  yearOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  yearOptionTextActive: {
    color: '#ffffff',
  },
  miniStats: {
    gap: 16,
  },
  miniStatItem: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 12,
  },
  miniStatLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  miniStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 2,
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
  desktopScrollContent: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  desktopTwoColumn: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
  },
  desktopTransactionsColumn: {
    flex: 1.5,
  },
  desktopCategoriesColumn: {
    flex: 1,
  },
  desktopCategoriesFixed: {
    position: Platform.OS === 'web' ? 'sticky' : 'relative' as any,
    top: 20,
    maxHeight: Platform.OS === 'web' ? 'calc(100vh - 100px)' : 'auto' as any,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  desktopCategoryGrid: {
    flexWrap: 'wrap',
    gap: 12,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1f2937',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any,
  searchCloseButton: {
    padding: 4,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchButtonText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  filterToggles: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  filterToggle: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
  },
  filterToggleActive: {
    backgroundColor: '#3b82f6',
  },
  filterToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  filterToggleTextActive: {
    color: '#ffffff',
  },
  duplicateToggle: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
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
