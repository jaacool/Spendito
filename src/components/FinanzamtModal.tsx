import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { X, Download, FileText, Calendar } from 'lucide-react-native';
import { useApp } from '../context/AppContext';
import { finanzamtExportService } from '../services/finanzamtExport';

interface FinanzamtModalProps {
  visible: boolean;
  onClose: () => void;
}

export function FinanzamtModal({ visible, onClose }: FinanzamtModalProps) {
  const { availableYears, transactions, yearSummary, selectedYear, setSelectedYear } = useApp();
  const [isExporting, setIsExporting] = useState(false);
  const [organizationName, setOrganizationName] = useState('Tierschutzverein');

  const handleExport = async () => {
    if (!yearSummary) {
      Alert.alert('Fehler', 'Keine Daten für das ausgewählte Jahr verfügbar.');
      return;
    }

    if (!organizationName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Vereinsnamen ein.');
      return;
    }

    setIsExporting(true);
    try {
      await finanzamtExportService.generatePDF({
        year: selectedYear,
        transactions,
        yearSummary,
        organizationName: organizationName.trim(),
      });
      
      Alert.alert(
        'Export erfolgreich',
        'Der Finanzamt-Export wurde erstellt und kann jetzt geteilt werden.',
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      Alert.alert('Fehler', 'Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const yearTransactions = transactions.filter(t => !t.isDuplicate && !t.isGuthabenTransfer);
  const incomeCount = yearTransactions.filter(t => t.type === 'income').length;
  const expenseCount = yearTransactions.filter(t => t.type === 'expense').length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <FileText size={24} color="#1e40af" />
              <Text style={styles.title}>Finanzamt Export</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>📋 Was wird exportiert?</Text>
              <Text style={styles.infoText}>
                Der Export enthält alle steuerrelevanten Informationen für das Finanzamt:
              </Text>
              <View style={styles.infoList}>
                <Text style={styles.infoItem}>• Jahresübersicht (Einnahmen/Ausgaben/Saldo)</Text>
                <Text style={styles.infoItem}>• Einnahmen nach Kategorien</Text>
                <Text style={styles.infoItem}>• Ausgaben nach Kategorien</Text>
                <Text style={styles.infoItem}>• Detaillierte Transaktionsliste</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Vereinsname</Text>
              <TextInput
                style={styles.input}
                value={organizationName}
                onChangeText={setOrganizationName}
                placeholder="z.B. Tierschutzverein e.V."
                placeholderTextColor="#9ca3af"
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Jahr auswählen</Text>
              <View style={styles.yearGrid}>
                {availableYears.map(year => (
                  <Pressable
                    key={year}
                    style={[
                      styles.yearButton,
                      selectedYear === year && styles.yearButtonActive,
                    ]}
                    onPress={() => setSelectedYear(year)}
                  >
                    <Calendar size={16} color={selectedYear === year ? '#fff' : '#6b7280'} />
                    <Text
                      style={[
                        styles.yearButtonText,
                        selectedYear === year && styles.yearButtonTextActive,
                      ]}
                    >
                      {year}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {yearSummary && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Vorschau für {selectedYear}</Text>
                <View style={styles.previewGrid}>
                  <View style={[styles.previewCard, styles.incomeCard]}>
                    <Text style={styles.previewLabel}>Einnahmen</Text>
                    <Text style={styles.previewValue}>
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(yearSummary.totalIncome)}
                    </Text>
                    <Text style={styles.previewCount}>{incomeCount} Transaktionen</Text>
                  </View>
                  <View style={[styles.previewCard, styles.expenseCard]}>
                    <Text style={styles.previewLabel}>Ausgaben</Text>
                    <Text style={styles.previewValue}>
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(Math.abs(yearSummary.totalExpense))}
                    </Text>
                    <Text style={styles.previewCount}>{expenseCount} Transaktionen</Text>
                  </View>
                  <View style={[styles.previewCard, styles.balanceCard]}>
                    <Text style={styles.previewLabel}>Saldo</Text>
                    <Text style={styles.previewValue}>
                      {new Intl.NumberFormat('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      }).format(yearSummary.balance)}
                    </Text>
                    <Text style={styles.previewCount}>
                      {yearSummary.incomeByCategory.length} Einnahmen-Kategorien
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.categorySection}>
              <Text style={styles.sectionTitle}>Kategorien-Übersicht</Text>
              {yearSummary && (
                <>
                  <Text style={styles.categoryGroupTitle}>Einnahmen</Text>
                  {yearSummary.incomeByCategory.map(cat => (
                    <View key={cat.category} style={styles.categoryRow}>
                      <Text style={styles.categoryName}>{cat.category}</Text>
                      <Text style={styles.categoryAmount}>
                        {new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(cat.total)}
                      </Text>
                    </View>
                  ))}
                  <Text style={[styles.categoryGroupTitle, { marginTop: 15 }]}>Ausgaben</Text>
                  {yearSummary.expenseByCategory.map(cat => (
                    <View key={cat.category} style={styles.categoryRow}>
                      <Text style={styles.categoryName}>{cat.category}</Text>
                      <Text style={styles.categoryAmount}>
                        {new Intl.NumberFormat('de-DE', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(Math.abs(cat.total))}
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
              onPress={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Download size={20} color="#fff" />
                  <Text style={styles.exportButtonText}>Export erstellen</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    padding: 20,
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
  },
  infoList: {
    marginTop: 4,
  },
  infoItem: {
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 4,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f2937',
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  yearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  yearButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  yearButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  yearButtonTextActive: {
    color: '#fff',
  },
  previewGrid: {
    gap: 12,
  },
  previewCard: {
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
  },
  incomeCard: {
    backgroundColor: '#f0fdf4',
    borderLeftColor: '#22c55e',
  },
  expenseCard: {
    backgroundColor: '#fef2f2',
    borderLeftColor: '#ef4444',
  },
  balanceCard: {
    backgroundColor: '#faf5ff',
    borderLeftColor: '#8b5cf6',
  },
  previewLabel: {
    fontSize: 12,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  previewCount: {
    fontSize: 12,
    color: '#9ca3af',
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  categoryName: {
    fontSize: 14,
    color: '#4b5563',
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  exportButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
