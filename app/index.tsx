// File: app/index.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, Dog } from 'lucide-react-native';
import { useApp } from '../src/context/AppContext';
import { isDesktop } from '../src/services/platform';
import { showMessage } from '../src/services/dialogs';
import { useTransactionFilters } from '../src/frontend/useTransactionFilters';
import {
  SummaryHeader,
  SideMenu,
  ReviewModal,
  SettingsModal,
  FinanzamtModal,
} from '../src/components';
import { TransactionFilterBar } from '../src/components/home/TransactionFilterBar';
import { TransactionList } from '../src/components/home/TransactionList';
import { CategoryOverview } from '../src/components/home/CategoryOverview';
import { homeStyles as styles } from '../src/components/home/homeStyles';

/**
 * Home screen: wires app state (AppContext + filter hook) to the UI blocks.
 * Desktop: sidebar | booking list | category overview. Phone: one scroll view.
 */
export default function HomeScreen() {
  const {
    transactions,
    selectedYear,
    availableYears,
    yearSummary,
    isLoading,
    isSideMenuOpen,
    selectedCategory,
    setSelectedYear,
    setSideMenuOpen,
    setSelectedCategory,
    updateTransactionCategory,
    confirmTransaction,
    refreshData,
  } = useApp();

  const { width } = useWindowDimensions();
  const desktopMode = isDesktop(width);

  const filters = useTransactionFilters(transactions, selectedCategory);
  const [refreshing, setRefreshing] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFinanzamtOpen, setIsFinanzamtOpen] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } catch (error) {
      console.error('[Home] Refresh failed:', error);
      showMessage('Fehler', 'Die Daten konnten nicht neu geladen werden.');
    } finally {
      setRefreshing(false);
    }
  };

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />
  );

  const filterBar = (
    <TransactionFilterBar
      typeFilter={filters.typeFilter}
      onTypeFilterChange={filters.setTypeFilter}
      accountFilter={filters.accountFilter}
      onAccountFilterChange={filters.setAccountFilter}
      showSearch={filters.showSearch}
      searchQuery={filters.searchQuery}
      onSearchQueryChange={filters.setSearchQuery}
      onOpenSearch={filters.openSearch}
      onCloseSearch={filters.closeSearch}
      openCount={filters.openCount}
      showOnlyOpen={filters.showOnlyOpen}
      onToggleOnlyOpen={filters.toggleOnlyOpen}
      duplicateCount={filters.duplicateCount}
      showDuplicates={filters.showDuplicates}
      onToggleDuplicates={filters.toggleDuplicates}
    />
  );

  const transactionList = (
    <TransactionList
      transactions={filters.filteredTransactions}
      selectedCategory={selectedCategory}
      onClearCategory={() => setSelectedCategory(null)}
      onCategoryChange={updateTransactionCategory}
      onConfirm={confirmTransaction}
      onError={message => showMessage('Fehler', message)}
    />
  );

  const sideMenuProps = {
    selectedYear,
    availableYears,
    onYearSelect: setSelectedYear,
    onOpenReview: () => setIsReviewOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenFinanzamt: () => setIsFinanzamtOpen(true),
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
      {/* Header - Only on Mobile */}
      {!desktopMode && (
        <View style={styles.header}>
          <Pressable onPress={() => setSideMenuOpen(true)} style={styles.menuButton}>
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
          </View>
        </View>
      )}

      <View style={styles.mainContent}>
        {desktopMode ? (
          <>
            {/* Desktop Sidebar - Same as Mobile SideMenu */}
            <SideMenu {...sideMenuProps} isOpen={true} onClose={() => {}} isDesktopSidebar={true} />

            <View style={styles.desktopContainer}>
              <View style={styles.desktopTwoColumn}>
                {/* Transactions (left) */}
                <View style={styles.desktopTransactionsColumn}>
                  <View style={styles.desktopTransactionsHeader}>{filterBar}</View>
                  <ScrollView
                    style={styles.desktopColumnScroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={refreshControl}
                  >
                    <View style={styles.desktopColumnContent}>{transactionList}</View>
                  </ScrollView>
                </View>

                {/* Summary + categories (right) */}
                <View style={styles.desktopCategoriesColumn}>
                  <ScrollView style={styles.desktopColumnScroll} showsVerticalScrollIndicator={false}>
                    <View style={styles.desktopColumnContent}>
                      {yearSummary && (
                        <>
                          <SummaryHeader summary={yearSummary} />
                          <CategoryOverview
                            summary={yearSummary}
                            selectedCategory={selectedCategory}
                            onSelectCategory={setSelectedCategory}
                            layout="grid"
                          />
                        </>
                      )}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          </>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={refreshControl}
          >
            {yearSummary && (
              <>
                <SummaryHeader summary={yearSummary} />
                <CategoryOverview
                  summary={yearSummary}
                  selectedCategory={selectedCategory}
                  onSelectCategory={setSelectedCategory}
                  layout="scroll"
                />
              </>
            )}
            <View style={styles.transactionsSectionContainer}>
              {filterBar}
              {transactionList}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Side Menu (Only for Mobile) */}
      {!desktopMode && (
        <SideMenu {...sideMenuProps} isOpen={isSideMenuOpen} onClose={() => setSideMenuOpen(false)} />
      )}

      {/* AI Review Modal */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        onApplyChange={updateTransactionCategory}
        selectedYear={selectedYear}
        availableYears={availableYears}
      />

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* Finanzamt Export Modal */}
      <FinanzamtModal visible={isFinanzamtOpen} onClose={() => setIsFinanzamtOpen(false)} />
    </SafeAreaView>
  );
}
