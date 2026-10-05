// File: src/components/home/TransactionFilterBar.tsx
import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Building2, Wallet, Search, X } from 'lucide-react-native';
import { SourceAccount } from '../../types';
import { homeStyles as styles } from './homeStyles';

type TypeFilter = 'all' | 'income' | 'expense';
type AccountFilter = 'all' | SourceAccount;

interface TransactionFilterBarProps {
  typeFilter: TypeFilter;
  onTypeFilterChange: (value: TypeFilter) => void;
  accountFilter: AccountFilter;
  onAccountFilterChange: (value: AccountFilter) => void;
  showSearch: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  openCount: number;
  showOnlyOpen: boolean;
  onToggleOnlyOpen: () => void;
  duplicateCount: number;
  showDuplicates: boolean;
  onToggleDuplicates: () => void;
}

const TYPE_TABS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'income', label: 'Einnahmen' },
  { value: 'expense', label: 'Ausgaben' },
];

/**
 * Tabs (Alle/Einnahmen/Ausgaben), account filter (Kombi/Volksbank/PayPal),
 * search and the "offen"/"Duplikate" toggles above the booking list.
 */
export function TransactionFilterBar(props: TransactionFilterBarProps) {
  const { typeFilter, accountFilter } = props;

  return (
    <>
      {/* Transaction Tabs */}
      <View style={styles.tabsContainer}>
        {TYPE_TABS.map(tab => (
          <Pressable
            key={tab.value}
            style={[styles.tab, typeFilter === tab.value && styles.tabActive]}
            onPress={() => props.onTypeFilterChange(tab.value)}
          >
            <Text style={[styles.tabText, typeFilter === tab.value && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Account Filter */}
      <View style={styles.accountFilterContainer}>
        <Pressable
          style={[styles.accountFilterButton, accountFilter === 'all' && styles.accountFilterActive]}
          onPress={() => props.onAccountFilterChange('all')}
        >
          <Text style={[styles.accountFilterText, accountFilter === 'all' && styles.accountFilterTextActive]}>
            Kombi
          </Text>
        </Pressable>
        <Pressable
          style={[styles.accountFilterButton, accountFilter === 'volksbank' && styles.accountFilterActive]}
          onPress={() => props.onAccountFilterChange('volksbank')}
        >
          <Building2 size={12} color={accountFilter === 'volksbank' ? '#0066b3' : '#6b7280'} />
          <Text style={[styles.accountFilterText, accountFilter === 'volksbank' && { color: '#0066b3' }]}>
            Volksbank
          </Text>
        </Pressable>
        <Pressable
          style={[styles.accountFilterButton, accountFilter === 'paypal' && styles.accountFilterActive]}
          onPress={() => props.onAccountFilterChange('paypal')}
        >
          <Wallet size={12} color={accountFilter === 'paypal' ? '#003087' : '#6b7280'} />
          <Text style={[styles.accountFilterText, accountFilter === 'paypal' && { color: '#003087' }]}>
            PayPal
          </Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      {props.showSearch ? (
        <View style={styles.searchContainer}>
          <Search size={18} color="#9ca3af" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Suche nach Betrag (z.B. 500) oder Text..."
            placeholderTextColor="#9ca3af"
            value={props.searchQuery}
            onChangeText={props.onSearchQueryChange}
            autoFocus
          />
          <Pressable onPress={props.onCloseSearch} style={styles.searchCloseButton}>
            <X size={18} color="#6b7280" />
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.searchButton} onPress={props.onOpenSearch}>
          <Search size={16} color="#6b7280" />
          <Text style={styles.searchButtonText}>Suchen...</Text>
        </Pressable>
      )}

      {/* Filter Toggles */}
      <View style={styles.filterToggles}>
        {props.openCount > 0 && (
          <Pressable
            style={[styles.filterToggle, props.showOnlyOpen && styles.filterToggleActive]}
            onPress={props.onToggleOnlyOpen}
          >
            <Text style={[styles.filterToggleText, props.showOnlyOpen && styles.filterToggleTextActive]}>
              {props.showOnlyOpen ? 'Alle anzeigen' : `${props.openCount} offen`}
            </Text>
          </Pressable>
        )}

        {props.duplicateCount > 0 && (
          <Pressable style={styles.duplicateToggle} onPress={props.onToggleDuplicates}>
            <Text style={styles.duplicateToggleText}>
              {props.showDuplicates ? 'Duplikate ausblenden' : `${props.duplicateCount} Duplikate`}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}
