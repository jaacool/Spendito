import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { X, Type, Minus, Circle, Plus } from 'lucide-react-native';
import { useSettings, UIScale } from '../context/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SCALE_OPTIONS: { value: UIScale; label: string; description: string }[] = [
  { value: 'compact', label: 'Kompakt', description: 'Schlank & modern' },
  { value: 'default', label: 'Standard', description: 'Ausgewogen' },
  { value: 'large', label: 'Groß', description: 'Bessere Lesbarkeit' },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { uiScale, setUIScale } = useSettings();

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Einstellungen</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </Pressable>
          </View>

          {/* UI Scale Setting */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Type size={16} color="#6b7280" />
              <Text style={styles.sectionTitle}>Anzeigegröße</Text>
            </View>
            
            <View style={styles.scaleOptions}>
              {SCALE_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.scaleOption,
                    uiScale === option.value && styles.scaleOptionActive,
                  ]}
                  onPress={() => setUIScale(option.value)}
                >
                  <View style={styles.scaleIconContainer}>
                    {option.value === 'compact' && <Minus size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                    {option.value === 'default' && <Circle size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                    {option.value === 'large' && <Plus size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                  </View>
                  <Text style={[
                    styles.scaleLabel,
                    uiScale === option.value && styles.scaleLabelActive,
                  ]}>
                    {option.label}
                  </Text>
                  <Text style={styles.scaleDescription}>{option.description}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={styles.previewSection}>
            <Text style={styles.previewLabel}>Vorschau</Text>
            <View style={styles.previewCard}>
              <Text style={[styles.previewTitle, { fontSize: 14 * (uiScale === 'compact' ? 0.85 : uiScale === 'large' ? 1.15 : 1) }]}>
                Beispiel Transaktion
              </Text>
              <Text style={[styles.previewAmount, { fontSize: 18 * (uiScale === 'compact' ? 0.85 : uiScale === 'large' ? 1.15 : 1) }]}>
                +250,00 €
              </Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scaleOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  scaleOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  scaleOptionActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  scaleIconContainer: {
    marginBottom: 6,
  },
  scaleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  scaleLabelActive: {
    color: '#0ea5e9',
  },
  scaleDescription: {
    fontSize: 10,
    color: '#9ca3af',
  },
  previewSection: {
    padding: 16,
    paddingTop: 0,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
    marginBottom: 8,
  },
  previewCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    fontWeight: '500',
    color: '#374151',
  },
  previewAmount: {
    fontWeight: '600',
    color: '#22c55e',
  },
});
