import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { X, Type, Minus, Circle, Plus, Building2, Wallet, Link, Unlink, ExternalLink, CheckCircle2 } from 'lucide-react-native';
import { useSettings, UIScale } from '../context/SettingsContext';
import { apiConfigService, ConnectionStatus } from '../services/apiConfig';
import { gocardlessApiService } from '../services/gocardlessApi';
import Constants from 'expo-constants';

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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bankSearchResults, setBankSearchResults] = useState<any[]>([]);
  const [showBankList, setShowBankList] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConnectionStatus();
    }
  }, [isOpen]);

  const loadConnectionStatus = async () => {
    try {
      await apiConfigService.initialize();
      const status = await apiConfigService.getConnectionStatus();
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to load connection status:', error);
    }
  };

  const handleConnectPayPal = async () => {
    if (!apiConfigService.isPayPalConfigured()) {
      alert('PayPal API ist nicht konfiguriert. Bitte API-Keys in .env setzen.');
      return;
    }

    const redirectUri = 'spendito://paypal-callback';
    const authUrl = apiConfigService.getPayPalAuthUrl(redirectUri);
    
    try {
      await Linking.openURL(authUrl);
    } catch (error) {
      console.error('Failed to open PayPal auth:', error);
    }
  };

  const handleDisconnectPayPal = async () => {
    await apiConfigService.disconnectPayPal();
    await loadConnectionStatus();
  };

  const handleConnectBank = async () => {
    if (!apiConfigService.isGoCardlessConfigured()) {
      alert('GoCardless API ist nicht konfiguriert. Bitte API-Keys in .env setzen.');
      return;
    }

    setIsLoading(true);
    try {
      // Search for Volksbank
      const banks = await gocardlessApiService.searchBank('Volksbank');
      setBankSearchResults(banks.slice(0, 10)); // Show top 10 results
      setShowBankList(true);
    } catch (error) {
      console.error('Failed to search banks:', error);
      alert('Fehler beim Laden der Banken. Bitte prüfe die API-Konfiguration.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBank = async (institutionId: string, institutionName: string) => {
    setIsLoading(true);
    try {
      const redirectUrl = 'spendito://bank-callback';
      const reference = `spendito_${Date.now()}`;
      
      const { id, link } = await gocardlessApiService.createBankConnection(
        institutionId,
        redirectUrl,
        reference
      );

      // Store requisition ID temporarily
      await apiConfigService.saveBankConnection(id, '', institutionName);
      
      // Open bank authentication
      await Linking.openURL(link);
      setShowBankList(false);
    } catch (error) {
      console.error('Failed to create bank connection:', error);
      alert('Fehler beim Verbinden mit der Bank.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectBank = async () => {
    await apiConfigService.disconnectBank();
    await loadConnectionStatus();
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

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

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Bank Connections Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Link size={16} color="#6b7280" />
                <Text style={styles.sectionTitle}>Kontoverbindungen</Text>
              </View>

              {/* Volksbank Connection */}
              <View style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: '#0066b315' }]}>
                    <Building2 size={18} color="#0066b3" />
                  </View>
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>Volksbank</Text>
                    {connectionStatus?.volksbank.connected ? (
                      <View style={styles.connectedBadge}>
                        <CheckCircle2 size={10} color="#22c55e" />
                        <Text style={styles.connectedText}>
                          {connectionStatus.volksbank.institutionName || 'Verbunden'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.disconnectedText}>Nicht verbunden</Text>
                    )}
                  </View>
                </View>
                {connectionStatus?.volksbank.connected ? (
                  <Pressable style={styles.disconnectButton} onPress={handleDisconnectBank}>
                    <Unlink size={14} color="#ef4444" />
                  </Pressable>
                ) : (
                  <Pressable 
                    style={[styles.connectButton, isLoading && styles.buttonDisabled]} 
                    onPress={handleConnectBank}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#0066b3" />
                    ) : (
                      <>
                        <ExternalLink size={12} color="#0066b3" />
                        <Text style={styles.connectButtonText}>Verbinden</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              {/* PayPal Connection */}
              <View style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: '#00308715' }]}>
                    <Wallet size={18} color="#003087" />
                  </View>
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>PayPal</Text>
                    {connectionStatus?.paypal.connected ? (
                      <View style={styles.connectedBadge}>
                        <CheckCircle2 size={10} color="#22c55e" />
                        <Text style={styles.connectedText}>Verbunden</Text>
                      </View>
                    ) : (
                      <Text style={styles.disconnectedText}>Nicht verbunden</Text>
                    )}
                  </View>
                </View>
                {connectionStatus?.paypal.connected ? (
                  <Pressable style={styles.disconnectButton} onPress={handleDisconnectPayPal}>
                    <Unlink size={14} color="#ef4444" />
                  </Pressable>
                ) : (
                  <Pressable style={styles.connectButton} onPress={handleConnectPayPal}>
                    <ExternalLink size={12} color="#003087" />
                    <Text style={[styles.connectButtonText, { color: '#003087' }]}>Verbinden</Text>
                  </Pressable>
                )}
              </View>

              {/* Bank Selection List */}
              {showBankList && bankSearchResults.length > 0 && (
                <View style={styles.bankList}>
                  <Text style={styles.bankListTitle}>Bank auswählen:</Text>
                  {bankSearchResults.map((bank) => (
                    <Pressable
                      key={bank.id}
                      style={styles.bankOption}
                      onPress={() => handleSelectBank(bank.id, bank.name)}
                    >
                      <Text style={styles.bankOptionName}>{bank.name}</Text>
                      <Text style={styles.bankOptionBic}>{bank.bic}</Text>
                    </Pressable>
                  ))}
                  <Pressable 
                    style={styles.cancelBankButton}
                    onPress={() => setShowBankList(false)}
                  >
                    <Text style={styles.cancelBankText}>Abbrechen</Text>
                  </Pressable>
                </View>
              )}
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

            {/* Version */}
            <View style={styles.versionSection}>
              <Text style={styles.versionText}>Spendito v{appVersion}</Text>
            </View>
          </ScrollView>
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
  // Connection styles
  scrollContent: {
    maxHeight: 500,
  },
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  connectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  connectionDetails: {
    flex: 1,
  },
  connectionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  connectedText: {
    fontSize: 11,
    color: '#22c55e',
    fontWeight: '500',
  },
  disconnectedText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
  },
  connectButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0066b3',
  },
  disconnectButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  bankList: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    maxHeight: 200,
  },
  bankListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  bankOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  bankOptionName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
  },
  bankOptionBic: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 2,
  },
  cancelBankButton: {
    padding: 10,
    alignItems: 'center',
  },
  cancelBankText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  versionSection: {
    padding: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
