import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, ScrollView, TextInput, Alert, Linking, TouchableOpacity, Platform, Animated } from 'react-native';
import { 
  X, 
  Type, 
  Minus, 
  Circle, 
  Plus, 
  Wallet, 
  Link, 
  Unlink, 
  CheckCircle2, 
  RefreshCw, 
  Trash2, 
  Upload, 
  FileText, 
  Download, 
  Database,
  Key,
  ShieldCheck
} from 'lucide-react-native';
import { useSettings, UIScale } from '../context/SettingsContext';
import { backendApiService } from '../services/backendApi';
import { storageService } from '../services/storage';
import { csvImportService } from '../services/csvImport';
import { backupService } from '../services/backup';
import { secureStorageService } from '../services/secureStorage';
import Constants from 'expo-constants';

import { useApp } from '../context/AppContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SCALE_OPTIONS: { value: UIScale; label: string; description: string }[] = [
  { value: 'compact', label: 'Kompakt', description: 'Schlank & modern' },
  { value: 'default', label: 'Standard', description: 'Ausgewogen' },
  { value: 'large', label: 'Groß', description: 'Bessere Lesbarkeit' },
];

interface PayPalStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { uiScale, setUIScale } = useSettings();
  const { refreshData, setReferenceBalance, cleanupTransactions, exportDatabase } = useApp();
  const [paypalStatus, setPaypalStatus] = useState<PayPalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaypalLoading, setIsPaypalLoading] = useState(false);
  const [isBackupLoading, setIsBackupLoading] = useState(false);
  
  // CSV Import state
  const [isCSVImporting, setIsCSVImporting] = useState(false);
  const [csvImportResult, setCSVImportResult] = useState<string | null>(null);
  
  // Cache deletion warning state
  const [showCacheWarning, setShowCacheWarning] = useState(false);
  const [cacheConfirmStep, setCacheConfirmStep] = useState<1 | 2 | 3>(1);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // Reference balance state
  const [volksbankBalance, setVolksbankBalance] = useState('');
  const [paypalBalance, setPaypalBalance] = useState('');

  // AI Key state
  const [aiApiKey, setAiApiKey] = useState('');
  const [hasAiApiKey, setHasAiApiKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPayPalStatus();
      loadReferenceBalances();
      loadAIKeyStatus();
      cleanupTransactions(); // Run cleanup when opening settings
    }
  }, [isOpen]);

  const loadAIKeyStatus = async () => {
    const exists = await secureStorageService.hasApiKey();
    setHasAiApiKey(exists);
  };

  const handleSaveAIKey = async () => {
    if (!aiApiKey.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen gültigen API-Key ein.');
      return;
    }
    
    setIsSavingKey(true);
    try {
      await secureStorageService.saveApiKey(aiApiKey.trim());
      setAiApiKey(''); // Clear for security
      await loadAIKeyStatus();
      Alert.alert('Erfolg', 'KI API-Key wurde sicher gespeichert.');
    } catch (error) {
      Alert.alert('Fehler', 'Key konnte nicht gespeichert werden.');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteAIKey = async () => {
    Alert.alert(
      'Key löschen',
      'Möchtest du den gespeicherten KI API-Key wirklich entfernen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Löschen', 
          style: 'destructive',
          onPress: async () => {
            await secureStorageService.deleteApiKey();
            await loadAIKeyStatus();
          }
        }
      ]
    );
  };

  const loadReferenceBalances = async () => {
    const vb = storageService.getReferenceBalance('volksbank');
    const pp = storageService.getReferenceBalance('paypal');
    if (vb) setVolksbankBalance(vb.amount.toString());
    if (pp) setPaypalBalance(pp.amount.toString());
  };

  const handleSaveBalance = async (account: 'volksbank' | 'paypal') => {
    const val = account === 'volksbank' ? volksbankBalance : paypalBalance;
    const amount = parseFloat(val.replace(',', '.'));
    if (isNaN(amount)) {
      Alert.alert('Fehler', 'Bitte gib einen gültigen Betrag ein.');
      return;
    }
    await setReferenceBalance(account, amount);
    Alert.alert('Erfolg', 'Kontostand wurde gespeichert.');
  };

  const loadPayPalStatus = async () => {
    try {
      const status = await backendApiService.getPayPalStatus();
      setPaypalStatus(status);
    } catch (error) {
      console.error('Failed to load PayPal status:', error);
    }
  };

  const handleConnectPayPal = async () => {
    setIsPaypalLoading(true);
    try {
      await backendApiService.connectPayPal();
      await loadPayPalStatus();
      setIsPaypalLoading(false);
    } catch (error: any) {
      setIsPaypalLoading(false);
      if (error.message?.includes('pending') || error.message?.includes('approval')) {
        Alert.alert(
          'PayPal Genehmigung ausstehend',
          'Die PayPal-Integration wartet noch auf Genehmigung durch PayPal. Bitte versuche es später erneut.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'PayPal Verbindung',
          'Die PayPal-Anmeldung wird geöffnet. Falls ein Fehler auftritt, ist die PayPal-Integration möglicherweise noch nicht freigeschaltet.',
          [{ text: 'OK' }]
        );
      }
    }
  };

  const handleSyncPayPal = async () => {
    setIsPaypalLoading(true);
    try {
      const result = await backendApiService.syncPayPal();
      if (result.needsAuth) {
        Alert.alert(
          'PayPal nicht verbunden',
          'Bitte verbinde zuerst dein PayPal-Konto.',
          [
            { text: 'Abbrechen', style: 'cancel' },
            { text: 'Verbinden', onPress: handleConnectPayPal },
          ]
        );
        return;
      }
      
      const transactions = result.transactions || [];
      if (transactions.length > 0) {
        const importResult = await storageService.importTransactions(transactions);
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`PayPal Sync erfolgreich!\n\n${importResult.added} neue Transaktionen importiert\n${importResult.duplicates} Duplikate übersprungen\n\n✅ Daten nur lokal gespeichert!`);
        } else {
          Alert.alert('PayPal Sync', `${importResult.added} neue Transaktionen importiert!\n(${importResult.duplicates} Duplikate übersprungen)`);
        }
        await refreshData();
      } else {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Keine neuen Transaktionen gefunden.');
        } else {
          Alert.alert('PayPal Sync', 'Keine neuen Transaktionen gefunden.');
        }
      }
      await loadPayPalStatus();
    } catch (error: any) {
      console.error('[PayPal] Sync error:', error);
      Alert.alert('Fehler', error.message || 'PayPal Sync fehlgeschlagen');
    } finally {
      setIsPaypalLoading(false);
    }
  };

  const handleDisconnectPayPal = async () => {
    const confirm = typeof window !== 'undefined' && window.confirm
      ? window.confirm('Möchtest du PayPal wirklich trennen? Alle PayPal-Transaktionen werden gelöscht.')
      : true;
    
    if (!confirm) return;

    setIsPaypalLoading(true);
    try {
      await backendApiService.disconnectPayPal();
      await loadPayPalStatus();
      Alert.alert('Erfolg', 'PayPal wurde getrennt.');
    } catch (error: any) {
      Alert.alert('Fehler', 'Trennen fehlgeschlagen: ' + error.message);
    } finally {
      setIsPaypalLoading(false);
    }
  };

  const handleCSVFileSelect = () => {
    if (typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          await processCSVFile(file);
        }
      };
      input.click();
    } else {
      window.alert('CSV-Import ist derzeit nur im Browser verfügbar.');
    }
  };

  const processCSVFile = async (file: File) => {
    setIsCSVImporting(true);
    setCSVImportResult(null);
    try {
      const content = await file.text();
      const existingTransactions = await storageService.getTransactions();
      const result = await csvImportService.importVolksbankCSV(content, existingTransactions, {});
      
      if (result.success && result.transactions.length > 0) {
        const saveResult = await storageService.importTransactions(result.transactions);
        const message = `✓ ${saveResult.added} Transaktionen importiert\n${saveResult.duplicates} Duplikate übersprungen`;
        setCSVImportResult(message);
        await refreshData();
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`CSV Import erfolgreich!\n\n${message}`);
        }
      } else if (result.errors.length > 0) {
        setCSVImportResult(`Import fehlgeschlagen:\n${result.errors.join('\n')}`);
      } else {
        setCSVImportResult('Keine neuen Transaktionen gefunden.');
      }
    } catch (error: any) {
      console.error('[CSV] Import error:', error);
      setCSVImportResult(`Fehler beim Import: ${error.message}`);
    } finally {
      setIsCSVImporting(false);
    }
  };

  const handleExportData = async () => {
    setIsBackupLoading(true);
    try {
      await backupService.exportData();
    } catch (error: any) {
      Alert.alert('Export fehlgeschlagen', error.message);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const handleImportData = async () => {
    setIsBackupLoading(true);
    try {
      const result = await backupService.importData();
      if (result.success) {
        Alert.alert('Erfolg', result.message);
        await refreshData();
      } else {
        Alert.alert('Fehler', result.message);
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message);
    } finally {
      setIsBackupLoading(false);
    }
  };

  const appVersion = Constants.expoConfig?.version || '1.0.0';

  useEffect(() => {
    if (showCacheWarning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      blinkAnim.setValue(1);
    }
  }, [showCacheWarning]);

  const handleCacheDeleteClick = () => {
    setShowCacheWarning(true);
    setCacheConfirmStep(1);
  };

  const handleCacheConfirmStep1 = () => setCacheConfirmStep(2);
  const handleCacheConfirmStep2 = () => setCacheConfirmStep(3);
  const handleCacheConfirmStep3 = async () => {
    setShowCacheWarning(false);
    await storageService.clearAll();
    if (typeof window !== 'undefined' && window.alert) {
      window.alert('Cache wurde gelöscht. Die Seite wird nun neu geladen.');
      window.location.reload();
    } else {
      Alert.alert('Erfolg', 'Cache wurde gelöscht.');
      onClose();
    }
  };

  const handleCancelCacheDeletion = () => {
    setShowCacheWarning(false);
    setCacheConfirmStep(1);
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Einstellungen</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <X size={20} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Reference Balances Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Wallet size={16} color="#6b7280" />
                <Text style={styles.sectionTitle}>Aktuelle Kontostände (für Export)</Text>
              </View>
              <View style={styles.balanceInputContainer}>
                <View style={styles.balanceInputRow}>
                  <Text style={styles.balanceInputLabel}>Volksbank:</Text>
                  <TextInput style={styles.balanceInput} value={volksbankBalance} onChangeText={setVolksbankBalance} placeholder="0,00" keyboardType="numeric" />
                  <Text style={styles.currencyLabel}>€</Text>
                  <TouchableOpacity style={styles.saveBalanceButton} onPress={() => handleSaveBalance('volksbank')}>
                    <CheckCircle2 size={16} color="#22c55e" />
                  </TouchableOpacity>
                </View>
                <View style={styles.balanceInputRow}>
                  <Text style={styles.balanceInputLabel}>PayPal:</Text>
                  <TextInput style={styles.balanceInput} value={paypalBalance} onChangeText={setPaypalBalance} placeholder="0,00" keyboardType="numeric" />
                  <Text style={styles.currencyLabel}>€</Text>
                  <TouchableOpacity style={styles.saveBalanceButton} onPress={() => handleSaveBalance('paypal')}>
                    <CheckCircle2 size={16} color="#22c55e" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Backup & Restore Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Download size={16} color="#6b7280" />
                <Text style={styles.sectionTitle}>Datensicherung</Text>
              </View>
              <View style={styles.backupButtonsContainer}>
                <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#6366f115' } as any]} onPress={handleExportData}>
                  <Download size={12} color="#6366f1" />
                  <Text style={[styles.connectButtonText, { color: '#6366f1' }]}>Export</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#8b5cf615' } as any]} onPress={handleImportData} disabled={isBackupLoading}>
                  {isBackupLoading ? <ActivityIndicator size="small" color="#8b5cf6" /> : (
                    <><Upload size={12} color="#8b5cf6" /><Text style={[styles.connectButtonText, { color: '#8b5cf6' }]}>Import</Text></>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#f59e0b15' } as any]} onPress={exportDatabase}>
                  <Database size={12} color="#f59e0b" />
                  <Text style={[styles.connectButtonText, { color: '#f59e0b' }]}>DB Export</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Bank Connections Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Link size={16} color="#6b7280" />
                <Text style={styles.sectionTitle}>Kontoverbindungen</Text>
              </View>

              {/* CSV Import */}
              <View style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: '#10b98115' }]}>
                    <FileText size={18} color="#10b981" />
                  </View>
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>CSV Import</Text>
                    <Text style={styles.disconnectedText}>Volksbank Umsätze importieren</Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#10b98115' } as any]} onPress={handleCSVFileSelect} disabled={isCSVImporting}>
                  {isCSVImporting ? <ActivityIndicator size="small" color="#10b981" /> : (
                    <><Upload size={12} color="#10b981" /><Text style={[styles.connectButtonText, { color: '#10b981' }]}>CSV laden</Text></>
                  )}
                </TouchableOpacity>
              </View>

              {/* PayPal Connection */}
              <View style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: '#00308715' }]}>
                    <Wallet size={18} color="#003087" />
                  </View>
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>PayPal</Text>
                    {paypalStatus?.connected ? (
                      <View style={styles.connectedBadge}><CheckCircle2 size={10} color="#22c55e" /><Text style={styles.connectedText}>Verbunden</Text></View>
                    ) : <Text style={styles.disconnectedText}>{paypalStatus?.configured ? 'Nicht verbunden' : 'Nicht konfiguriert'}</Text>}
                  </View>
                </View>
                {paypalStatus?.configured && (
                  <View style={styles.paypalButtons}>
                    {paypalStatus?.connected ? (
                      <>
                        <Pressable style={[styles.syncButton, isPaypalLoading && styles.buttonDisabled]} onPress={handleSyncPayPal} disabled={isPaypalLoading}>
                          {isPaypalLoading ? <ActivityIndicator size="small" color="#003087" /> : (
                            <><RefreshCw size={12} color="#003087" /><Text style={[styles.connectButtonText, { color: '#003087' }]}>Sync</Text></>
                          )}
                        </Pressable>
                        <Pressable style={styles.disconnectButton} onPress={handleDisconnectPayPal}>
                          <Unlink size={14} color="#ef4444" />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={[styles.connectButton, { backgroundColor: '#00308715' }, isPaypalLoading && styles.buttonDisabled]} onPress={handleConnectPayPal} disabled={isPaypalLoading}>
                        {isPaypalLoading ? <ActivityIndicator size="small" color="#003087" /> : (
                          <><Link size={12} color="#003087" /><Text style={[styles.connectButtonText, { color: '#003087' }]}>Verbinden</Text></>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* AI Configuration Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Key size={16} color="#6b7280" />
                <Text style={styles.sectionTitle}>KI Analyse (Gemini)</Text>
              </View>
              <View style={styles.aiKeyContainer}>
                {hasAiApiKey ? (
                  <View style={styles.keyStatusBox}>
                    <View style={styles.keyStatusInfo}>
                      <ShieldCheck size={18} color="#22c55e" />
                      <Text style={styles.keyStatusText}>API-Key ist sicher hinterlegt</Text>
                    </View>
                    <TouchableOpacity onPress={handleDeleteAIKey} style={styles.deleteKeyButton}>
                      <Trash2 size={14} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.keyInputRow}>
                    <TextInput 
                      style={styles.keyInput} 
                      value={aiApiKey} 
                      onChangeText={setAiApiKey} 
                      placeholder="API-Key hier einfügen..." 
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TouchableOpacity 
                      style={[styles.saveKeyButton, isSavingKey && styles.buttonDisabled]} 
                      onPress={handleSaveAIKey}
                      disabled={isSavingKey}
                    >
                      {isSavingKey ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.saveKeyButtonText}>Speichern</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                <Text style={styles.balanceHelpText}>
                  Der Key wird nur lokal auf diesem Gerät verschlüsselt gespeichert.
                </Text>
              </View>
            </View>

            {/* UI Scale Setting */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}><Type size={16} color="#6b7280" /><Text style={styles.sectionTitle}>Anzeigegröße</Text></View>
              <View style={styles.scaleOptions}>
                {SCALE_OPTIONS.map((option) => (
                  <Pressable key={option.value} style={[styles.scaleOption, uiScale === option.value && styles.scaleOptionActive]} onPress={() => setUIScale(option.value)}>
                    <View style={styles.scaleIconContainer}>
                      {option.value === 'compact' && <Minus size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                      {option.value === 'default' && <Circle size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                      {option.value === 'large' && <Plus size={16} color={uiScale === option.value ? '#0ea5e9' : '#9ca3af'} />}
                    </View>
                    <Text style={[styles.scaleLabel, uiScale === option.value && styles.scaleLabelActive]}>{option.label}</Text>
                    <Text style={styles.scaleDescription}>{option.description}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Version */}
            <View style={styles.versionSection}>
              <Text style={styles.versionText}>Spendito v{appVersion}</Text>
              <Pressable style={styles.clearCacheButton} onPress={handleCacheDeleteClick}>
                <Trash2 size={14} color="#ef4444" />
                <Text style={styles.clearCacheText}>Cache löschen</Text>
              </Pressable>
            </View>
          </ScrollView>

          {/* Warning Modal */}
          {showCacheWarning && (
            <Modal visible={showCacheWarning} transparent animationType="fade" onRequestClose={handleCancelCacheDeletion}>
              <Pressable style={styles.warningOverlay} onPress={handleCancelCacheDeletion}>
                <Animated.View style={[styles.warningContainer, { opacity: blinkAnim }]}>
                  <View style={styles.warningHeader}><Text style={styles.warningTitle}>⚠️ WARNUNG ⚠️</Text></View>
                  <View style={styles.warningContent}>
                    {cacheConfirmStep === 1 && (
                      <><Text style={styles.warningText}>Cache löschen?</Text><View style={styles.warningButtons}>
                        <Pressable style={styles.warningCancelButton} onPress={handleCancelCacheDeletion}><Text style={styles.warningCancelText}>Abbrechen</Text></Pressable>
                        <Pressable style={styles.warningConfirmButton} onPress={handleCacheConfirmStep1}><Text style={styles.warningConfirmText}>Ja</Text></Pressable>
                      </View></>
                    )}
                    {cacheConfirmStep === 2 && (
                      <><Text style={styles.warningText}>Mit Aaron gesprochen?</Text><View style={styles.warningButtons}>
                        <Pressable style={styles.warningCancelButton} onPress={handleCancelCacheDeletion}><Text style={styles.warningCancelText}>Nein</Text></Pressable>
                        <Pressable style={styles.warningConfirmButton} onPress={handleCacheConfirmStep2}><Text style={styles.warningConfirmText}>Ja</Text></Pressable>
                      </View></>
                    )}
                    {cacheConfirmStep === 3 && (
                      <><Text style={styles.warningText}>LETZTE WARNUNG!</Text><View style={styles.warningButtons}>
                        <Pressable style={styles.warningCancelButton} onPress={handleCancelCacheDeletion}><Text style={styles.warningCancelText}>Abbrechen</Text></Pressable>
                        <Pressable style={styles.warningDangerButton} onPress={handleCacheConfirmStep3}><Text style={styles.warningDangerText}>LÖSCHEN!</Text></Pressable>
                      </View></>
                    )}
                  </View>
                </Animated.View>
              </Pressable>
            </Modal>
          )}
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
  versionSection: {
    padding: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 11,
    color: '#9ca3af',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#0066b3',
    fontWeight: '500',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  pinInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinInput: {
    flex: 1,
  },
  pinToggle: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  submitButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#0066b3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  tanMethodList: {
    gap: 8,
  },
  tanMethodOption: {
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tanMethodName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
    textAlign: 'center',
  },
  doneSection: {
    alignItems: 'center',
    gap: 8,
  },
  doneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  accountInfo: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  // PayPal styles
  paypalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backupButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backupButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  syncStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e8f4fd',
    borderRadius: 6,
  },
  clearCacheButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
  },
  clearCacheText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ef4444',
  },
  csvResultBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  csvResultText: {
    fontSize: 11,
    color: '#166534',
    lineHeight: 16,
  },
  // Warning modal styles
  warningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningContainer: {
    backgroundColor: '#dc2626',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    borderWidth: 4,
    borderColor: '#fef2f2',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  warningHeader: {
    backgroundColor: '#991b1b',
    padding: 20,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 2,
  },
  warningContent: {
    padding: 24,
  },
  warningText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
  },
  warningSubtext: {
    fontSize: 14,
    color: '#fecaca',
    textAlign: 'center',
    marginBottom: 24,
  },
  warningButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  warningCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  warningCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
  },
  warningConfirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#991b1b',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#7f1d1d',
  },
  warningConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  warningDangerButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#450a0a',
  },
  warningDangerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1,
  },
  // Balance styles
  balanceInputContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceInputLabel: {
    width: 80,
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  balanceInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#1f2937',
    textAlign: 'right',
  },
  currencyLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
    width: 12,
  },
  saveBalanceButton: {
    marginLeft: 12,
    padding: 4,
  },
  balanceHelpText: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // AI Key styles
  aiKeyContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
  },
  keyInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  keyInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#1f2937',
  },
  saveKeyButton: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveKeyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  keyStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 10,
  },
  keyStatusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keyStatusText: {
    fontSize: 13,
    color: '#166534',
    fontWeight: '500',
  },
  deleteKeyButton: {
    padding: 4,
  },
});
