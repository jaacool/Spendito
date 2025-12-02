import React from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { X, Calendar, ChevronRight, Dog, Settings, RefreshCw, Sparkles, SlidersHorizontal } from 'lucide-react-native';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  selectedYear: number;
  availableYears: number[];
  onYearSelect: (year: number) => void;
  onReloadData: () => void;
  onOpenReview: () => void;
  onOpenSettings: () => void;
}

export function SideMenu({ 
  isOpen, 
  onClose, 
  selectedYear, 
  availableYears, 
  onYearSelect,
  onReloadData,
  onOpenReview,
  onOpenSettings,
}: SideMenuProps) {
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.menu}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Dog size={28} color="#0ea5e9" strokeWidth={2} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Spendito</Text>
              <Text style={styles.subtitle}>Hunde-Rettungsverein</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Year Selection */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Calendar size={18} color="#6b7280" />
                <Text style={styles.sectionTitle}>Jahr auswählen</Text>
              </View>
              
              {availableYears.map((year) => (
                <Pressable
                  key={year}
                  style={[
                    styles.yearItem,
                    year === selectedYear && styles.yearItemSelected,
                  ]}
                  onPress={() => {
                    onYearSelect(year);
                    onClose();
                  }}
                >
                  <Text style={[
                    styles.yearText,
                    year === selectedYear && styles.yearTextSelected,
                  ]}>
                    {year}
                  </Text>
                  {year === selectedYear && (
                    <View style={styles.selectedIndicator} />
                  )}
                  <ChevronRight 
                    size={18} 
                    color={year === selectedYear ? '#0ea5e9' : '#d1d5db'} 
                  />
                </Pressable>
              ))}
            </View>

            {/* Actions */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Settings size={18} color="#6b7280" />
                <Text style={styles.sectionTitle}>Aktionen</Text>
              </View>
              
              <Pressable
                style={[styles.actionItem, styles.reviewAction]}
                onPress={() => {
                  onOpenReview();
                  onClose();
                }}
              >
                <Sparkles size={20} color="#8b5cf6" />
                <Text style={[styles.actionText, { color: '#8b5cf6' }]}>KI-Überprüfung starten</Text>
              </Pressable>

              <Pressable
                style={styles.actionItem}
                onPress={() => {
                  onOpenSettings();
                  onClose();
                }}
              >
                <SlidersHorizontal size={20} color="#6b7280" />
                <Text style={styles.actionText}>Einstellungen</Text>
              </Pressable>

              <Pressable
                style={styles.actionItem}
                onPress={() => {
                  onReloadData();
                  onClose();
                }}
              >
                <RefreshCw size={20} color="#6b7280" />
                <Text style={styles.actionText}>Demo-Daten neu laden</Text>
              </Pressable>
            </View>

            {/* Info */}
            <View style={styles.infoSection}>
              <Text style={styles.infoText}>
                Tippe auf eine Transaktion, um die Kategorie zu ändern. 
                Die App lernt aus deinen Korrekturen.
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Version 1.0.0</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 300,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  yearItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#f9fafb',
  },
  yearItemSelected: {
    backgroundColor: '#e0f2fe',
  },
  yearText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#374151',
  },
  yearTextSelected: {
    color: '#0ea5e9',
    fontWeight: '600',
  },
  selectedIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0ea5e9',
    marginRight: 8,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    gap: 12,
    marginBottom: 8,
  },
  reviewAction: {
    backgroundColor: '#f3e8ff',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  infoSection: {
    padding: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#9ca3af',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#d1d5db',
  },
});
