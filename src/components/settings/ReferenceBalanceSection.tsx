// File: src/components/settings/ReferenceBalanceSection.tsx
import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Wallet, CheckCircle2 } from 'lucide-react-native';
import { SourceAccount } from '../../types';
import { settingsStyles as styles } from './settingsStyles';

interface ReferenceBalanceSectionProps {
  inputs: Record<SourceAccount, string>;
  onChange: (account: SourceAccount, value: string) => void;
  onSave: (account: SourceAccount) => void;
}

const ACCOUNTS: { account: SourceAccount; label: string }[] = [
  { account: 'volksbank', label: 'Volksbank:' },
  { account: 'paypal', label: 'PayPal:' },
];

/** "Aktuelle Kontostände (für Export)" */
export function ReferenceBalanceSection({ inputs, onChange, onSave }: ReferenceBalanceSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Wallet size={16} color="#6b7280" />
        <Text style={styles.sectionTitle}>Aktuelle Kontostände (für Export)</Text>
      </View>
      <View style={styles.balanceInputContainer}>
        {ACCOUNTS.map(({ account, label }) => (
          <View key={account} style={styles.balanceInputRow}>
            <Text style={styles.balanceInputLabel}>{label}</Text>
            <TextInput
              style={styles.balanceInput}
              value={inputs[account]}
              onChangeText={value => onChange(account, value)}
              placeholder="0,00"
              keyboardType="numeric"
            />
            <Text style={styles.currencyLabel}>€</Text>
            <TouchableOpacity style={styles.saveBalanceButton} onPress={() => onSave(account)}>
              <CheckCircle2 size={16} color="#22c55e" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}
