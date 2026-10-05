// File: src/components/home/homeStyles.ts
// Shared styles of the home screen building blocks (desktop + mobile).
import { StyleSheet, Platform } from 'react-native';

export const homeStyles = StyleSheet.create({
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
  desktopContainer: {
    flex: 1,
    height: '100%',
  },
  desktopColumnScroll: {
    flex: 1,
  },
  desktopColumnContent: {
    paddingBottom: 40,
  },
  desktopTwoColumn: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 24,
  },
  desktopTransactionsColumn: {
    flex: 1.5,
    height: '100%',
  },
  desktopTransactionsHeader: {
    paddingBottom: 8,
    backgroundColor: '#e8f4fc',
  },
  desktopCategoriesColumn: {
    flex: 1,
    height: '100%',
  },
  desktopCategoriesFixed: {
    // Top-level container in scrollview
  },
  desktopCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6, // Compensate for card padding
  },
  desktopCategoryCardWrapper: {
    width: Platform.OS === 'web' ? '50%' : '50%' as any,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  categoriesSection: {
    // Container for all category sections
  },
  transactionsSectionContainer: {
    // Container for mobile transactions
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
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
  categoryFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  categoryFilterText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    flex: 1,
  },
  categoryFilterClose: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
  },
  transactionsList: {
    gap: 8,
  },
});
