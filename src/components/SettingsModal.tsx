import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, ScrollView, TextInput, Alert, Linking } from 'react-native';
import { X, Type, Minus, Circle, Plus, Building2, Wallet, Link, Unlink, CheckCircle2, RefreshCw, Eye, EyeOff, ExternalLink, Trash2 } from 'lucide-react-native';
import { useSettings, UIScale } from '../context/SettingsContext';
import { backendApiService } from '../services/backendApi';
import { storageService } from '../services/storage';
import { categorizationService } from '../services/categorization';
import { isSupabaseConfigured } from '../services/supabase';
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

interface BankConnectionStatus {
  connected: boolean;
  connectionId?: string;
}

interface PayPalStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { uiScale, setUIScale } = useSettings();
  const { refreshData } = useApp();
  const [connectionStatus, setConnectionStatus] = useState<BankConnectionStatus | null>(null);
  const [paypalStatus, setPaypalStatus] = useState<PayPalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaypalLoading, setIsPaypalLoading] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);
  const [showPin, setShowPin] = useState(false);
  
  // Bank connection form
  const [bankId, setBankId] = useState('');
  const [loginName, setLoginName] = useState('');
  const [pin, setPin] = useState('');
  const [connectionStep, setConnectionStep] = useState<'form' | 'tan-select' | 'syncing' | 'done'>('form');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tanMethods, setTanMethods] = useState<Array<{ id: string; name: string }>>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; account_number: string; iban?: string }>>([]);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConnectionStatus();
      loadPayPalStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PAYPAL_CONNECTED') {
        loadPayPalStatus();
      }
    };

    window.addEventListener('message', handleMessage);

    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url.includes('paypal-success')) {
        loadPayPalStatus();
      }
    });

    return () => {
      window.removeEventListener('message', handleMessage);
      subscription.remove();
    };
  }, []);

  const loadConnectionStatus = async () => {
    try {
      const status = await backendApiService.getConnectionStatus();
      setConnectionStatus(status);
    } catch (error) {
      console.error('Failed to load connection status:', error);
    }
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
      const authUrl = await backendApiService.getPayPalAuthUrl();
      
      // On web, use window.open to create a popup so we can communicate via postMessage
      if (typeof window !== 'undefined' && window.open) {
        const popup = window.open(authUrl, 'paypal-auth', 'width=500,height=700,scrollbars=yes');
        
        // Poll for popup close and refresh status
        const pollTimer = setInterval(async () => {
          if (popup?.closed) {
            clearInterval(pollTimer);
            await loadPayPalStatus();
            setIsPaypalLoading(false);
          }
        }, 500);
        
        // Also listen for postMessage from popup
        const handleMessage = async (event: MessageEvent) => {
          if (event.data?.type === 'PAYPAL_CONNECTED') {
            clearInterval(pollTimer);
            window.removeEventListener('message', handleMessage);
            await loadPayPalStatus();
            setIsPaypalLoading(false);
          }
        };
        window.addEventListener('message', handleMessage);
      } else {
        // On native, use Linking
        await Linking.openURL(authUrl);
        setIsPaypalLoading(false);
      }
    } catch (error: any) {
      setIsPaypalLoading(false);
      // Check if it's a PayPal approval pending error
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
      console.log('[PayPal] Starting sync...');
      // First sync from PayPal API to backend
      const result = await backendApiService.syncPayPal();
      console.log('[PayPal] Backend sync result:', result);
      
      if (result.needsAuth) {
        // User needs to connect PayPal first
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
      
      // Now fetch the transactions from backend and import to local storage
      const transactions = await backendApiService.getPayPalTransactions();
      console.log(`[PayPal] Fetched ${transactions.length} transactions from backend`);
      
      if (transactions.length > 0) {
        const importResult = await storageService.importTransactions(transactions);
        console.log('[PayPal] Storage import result:', importResult);
        
        Alert.alert(
          'PayPal Sync',
          `${importResult.added} neue Transaktionen importiert!\n(${importResult.duplicates} Duplikate übersprungen)`
        );
        
        // Refresh the app data to show new transactions
        await refreshData();
      } else {
        Alert.alert(
          'PayPal Sync',
          `Keine Transaktionen gefunden.\n\nBackend meldete: ${result.transactionsFound || 0} gefunden, ${result.transactionsAdded || 0} neu gespeichert.`
        );
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
    console.log('[PayPal] Disconnect requested');
    Alert.alert(
      'PayPal trennen',
      'Möchtest du PayPal wirklich trennen? Alle PayPal-Transaktionen werden gelöscht.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Trennen',
          style: 'destructive',
          onPress: async () => {
            console.log('[PayPal] Disconnecting...');
            try {
              await backendApiService.disconnectPayPal();
              await loadPayPalStatus();
              Alert.alert('Erfolg', 'PayPal wurde getrennt.');
            } catch (error: any) {
              console.error('[PayPal] Disconnect error:', error);
              Alert.alert('Fehler', 'Trennen fehlgeschlagen: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const handleConnectBank = async () => {
    setShowBankForm(true);
    setConnectionStep('form');
    setPin('');
    setStatusMessage('');
    
    // Load saved credentials if available
    const savedCredentials = await backendApiService.getSavedBankCredentials();
    if (savedCredentials) {
      setBankId(savedCredentials.bankId);
      setLoginName(savedCredentials.loginName);
    } else {
      setBankId('');
      setLoginName('');
    }
  };

  const handleSubmitBankForm = async () => {
    if (!bankId || !loginName || !pin) {
      Alert.alert('Fehler', 'Bitte fülle alle Felder aus.');
      return;
    }

    // Validate BLZ format
    if (!/^\d{8}$/.test(bankId)) {
      Alert.alert('Fehler', 'Die BLZ muss genau 8 Ziffern haben.');
      return;
    }

    setIsLoading(true);
    setStatusMessage('Verbinde mit Bank...');

    try {
      console.log('[Bank] Starting connection with BLZ:', bankId);
      const result = await backendApiService.initBankConnection(bankId, loginName, pin);
      console.log('[Bank] Connection result:', JSON.stringify(result, null, 2));
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      setSessionId(result.sessionId);
      
      if (result.tanMethods && result.tanMethods.length > 0) {
        console.log('[Bank] TAN methods available:', result.tanMethods.length);
        setTanMethods(result.tanMethods);
        setConnectionStep('tan-select');
        setStatusMessage('Wähle TAN-Verfahren');
      } else if (result.accounts && result.accounts.length > 0) {
        console.log('[Bank] Accounts found:', result.accounts.length);
        setAccounts(result.accounts);
        setConnectionStep('done');
        setStatusMessage('Verbindung erfolgreich!');
        await loadConnectionStatus();
      } else {
        // No TAN methods and no accounts - something unexpected
        console.log('[Bank] Unexpected result - no TAN methods or accounts');
        setStatusMessage('Warte auf Bankserver...');
        Alert.alert(
          'Hinweis',
          'Die Bank hat noch keine Konten zurückgegeben. Möglicherweise ist eine TAN-Freigabe in deiner Banking-App erforderlich.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('[Bank] Connection error:', error);
      const errorMessage = error.message || 'Unbekannter Fehler';
      
      // Provide more helpful error messages
      let userMessage = errorMessage;
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        userMessage = 'Netzwerkfehler. Bitte prüfe deine Internetverbindung.';
      } else if (errorMessage.includes('timeout')) {
        userMessage = 'Zeitüberschreitung. Der Bankserver antwortet nicht.';
      } else if (errorMessage.includes('401') || errorMessage.includes('auth')) {
        userMessage = 'Anmeldedaten falsch. Bitte prüfe BLZ, Login und PIN.';
      } else if (errorMessage.includes('500')) {
        userMessage = 'Serverfehler. Bitte versuche es später erneut.';
      }
      
      Alert.alert('Verbindung fehlgeschlagen', userMessage);
      setStatusMessage('Fehler: ' + userMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTanMethod = async (tanMethodId: string) => {
    if (!sessionId) return;

    setIsLoading(true);
    setConnectionStep('syncing');
    setStatusMessage('Synchronisiere Konten...');

    try {
      const result = await backendApiService.selectTanMethod(sessionId, tanMethodId);
      
      if (result.requiresTan) {
        Alert.alert('TAN erforderlich', result.tanChallenge || 'Bitte TAN eingeben');
        // TODO: Add TAN input UI
      } else if (result.accounts) {
        setAccounts(result.accounts);
        setConnectionStep('done');
        setStatusMessage(`${result.accounts.length} Konto(en) gefunden!`);
        await loadConnectionStatus();
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Synchronisierung fehlgeschlagen');
      setConnectionStep('tan-select');
      setStatusMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchTransactions = async () => {
    if (!sessionId || accounts.length === 0) return;

    setIsLoading(true);
    setStatusMessage('Lade Transaktionen...');

    try {
      const result = await backendApiService.fetchTransactions(sessionId, accounts[0].id);
      
      if (result.requiresTan) {
        Alert.alert('TAN erforderlich', result.tanChallenge || 'Bitte TAN eingeben');
      } else {
        Alert.alert('Erfolg', `${result.transactionsAdded} neue Transaktionen importiert!`);
        setShowBankForm(false);
        await backendApiService.endSession();
      }
    } catch (error: any) {
      Alert.alert('Fehler', error.message || 'Transaktionen konnten nicht geladen werden');
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  const handleDisconnectBank = async () => {
    Alert.alert(
      'Bank trennen',
      'Möchtest du die Bankverbindung wirklich trennen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Trennen',
          style: 'destructive',
          onPress: async () => {
            await backendApiService.disconnect();
            await loadConnectionStatus();
            setShowBankForm(false);
          },
        },
      ]
    );
  };

  const handleCancelBankForm = () => {
    setShowBankForm(false);
    setConnectionStep('form');
    setBankId('');
    setLoginName('');
    setPin('');
    setStatusMessage('');
    if (sessionId) {
      backendApiService.endSession();
      setSessionId(null);
    }
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
                    <Text style={styles.connectionName}>Volksbank (FinTS)</Text>
                    {connectionStatus?.connected ? (
                      <View style={styles.connectedBadge}>
                        <CheckCircle2 size={10} color="#22c55e" />
                        <Text style={styles.connectedText}>Verbunden</Text>
                      </View>
                    ) : (
                      <Text style={styles.disconnectedText}>Nicht verbunden</Text>
                    )}
                  </View>
                </View>
                {connectionStatus?.connected ? (
                  <Pressable style={styles.disconnectButton} onPress={handleDisconnectBank}>
                    <Unlink size={14} color="#ef4444" />
                  </Pressable>
                ) : (
                  <Pressable 
                    style={styles.connectButton} 
                    onPress={handleConnectBank}
                  >
                    <Link size={12} color="#0066b3" />
                    <Text style={styles.connectButtonText}>Verbinden</Text>
                  </Pressable>
                )}
              </View>

              {/* Bank Connection Form */}
              {showBankForm && (
                <View style={styles.bankForm}>
                  <Text style={styles.bankFormTitle}>
                    {connectionStep === 'form' && 'Bank verbinden'}
                    {connectionStep === 'tan-select' && 'TAN-Verfahren wählen'}
                    {connectionStep === 'syncing' && 'Synchronisiere...'}
                    {connectionStep === 'done' && 'Verbindung erfolgreich'}
                  </Text>

                  {statusMessage ? (
                    <View style={styles.statusBar}>
                      {isLoading && <ActivityIndicator size="small" color="#0066b3" />}
                      <Text style={styles.statusText}>{statusMessage}</Text>
                    </View>
                  ) : null}

                  {connectionStep === 'form' && (
                    <>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Bankleitzahl (BLZ)</Text>
                        <TextInput
                          style={styles.input}
                          value={bankId}
                          onChangeText={setBankId}
                          placeholder="z.B. 76069449"
                          keyboardType="number-pad"
                          maxLength={8}
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>VR-NetKey / Alias</Text>
                        <TextInput
                          style={styles.input}
                          value={loginName}
                          onChangeText={setLoginName}
                          placeholder="Dein Login-Name"
                          autoCapitalize="none"
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>PIN</Text>
                        <View style={styles.pinInputContainer}>
                          <TextInput
                            style={[styles.input, styles.pinInput]}
                            value={pin}
                            onChangeText={setPin}
                            placeholder="••••••"
                            secureTextEntry={!showPin}
                            autoCapitalize="none"
                          />
                          <Pressable 
                            style={styles.pinToggle}
                            onPress={() => setShowPin(!showPin)}
                          >
                            {showPin ? (
                              <EyeOff size={18} color="#6b7280" />
                            ) : (
                              <Eye size={18} color="#6b7280" />
                            )}
                          </Pressable>
                        </View>
                      </View>

                      <View style={styles.formButtons}>
                        <Pressable 
                          style={styles.cancelButton}
                          onPress={handleCancelBankForm}
                        >
                          <Text style={styles.cancelButtonText}>Abbrechen</Text>
                        </Pressable>
                        <Pressable 
                          style={[styles.submitButton, isLoading && styles.buttonDisabled]}
                          onPress={handleSubmitBankForm}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.submitButtonText}>Verbinden</Text>
                          )}
                        </Pressable>
                      </View>
                    </>
                  )}

                  {connectionStep === 'tan-select' && (
                    <View style={styles.tanMethodList}>
                      {tanMethods.map((method) => (
                        <Pressable
                          key={method.id}
                          style={styles.tanMethodOption}
                          onPress={() => handleSelectTanMethod(method.id)}
                          disabled={isLoading}
                        >
                          <Text style={styles.tanMethodName}>{method.name}</Text>
                        </Pressable>
                      ))}
                      <Pressable 
                        style={styles.cancelButton}
                        onPress={handleCancelBankForm}
                      >
                        <Text style={styles.cancelButtonText}>Abbrechen</Text>
                      </Pressable>
                    </View>
                  )}

                  {connectionStep === 'done' && (
                    <View style={styles.doneSection}>
                      <CheckCircle2 size={32} color="#22c55e" />
                      <Text style={styles.doneText}>
                        {accounts.length} Konto(en) gefunden
                      </Text>
                      {accounts.map((acc) => (
                        <Text key={acc.id} style={styles.accountInfo}>
                          {acc.iban || acc.account_number}
                        </Text>
                      ))}
                      <Pressable 
                        style={[styles.submitButton, { marginTop: 12 }]}
                        onPress={handleFetchTransactions}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <RefreshCw size={14} color="#fff" />
                            <Text style={styles.submitButtonText}>Transaktionen laden</Text>
                          </>
                        )}
                      </Pressable>
                      <Pressable 
                        style={[styles.cancelButton, { marginTop: 8 }]}
                        onPress={handleCancelBankForm}
                      >
                        <Text style={styles.cancelButtonText}>Schließen</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {/* PayPal Connection */}
              <View style={styles.connectionCard}>
                <View style={styles.connectionInfo}>
                  <View style={[styles.connectionIcon, { backgroundColor: '#00308715' }]}>
                    <Wallet size={18} color="#003087" />
                  </View>
                  <View style={styles.connectionDetails}>
                    <Text style={styles.connectionName}>PayPal</Text>
                    {paypalStatus?.connected ? (
                      <View style={styles.connectedBadge}>
                        <CheckCircle2 size={10} color="#22c55e" />
                        <Text style={styles.connectedText}>Verbunden</Text>
                      </View>
                    ) : paypalStatus?.configured ? (
                      <Text style={styles.disconnectedText}>Nicht verbunden</Text>
                    ) : (
                      <Text style={styles.disconnectedText}>Nicht konfiguriert</Text>
                    )}
                  </View>
                </View>
                {paypalStatus?.configured && (
                  <View style={styles.paypalButtons}>
                    {paypalStatus?.connected ? (
                      <>
                        <Pressable 
                          style={[styles.syncButton, isPaypalLoading && styles.buttonDisabled]}
                          onPress={handleSyncPayPal}
                          disabled={isPaypalLoading}
                        >
                          {isPaypalLoading ? (
                            <ActivityIndicator size="small" color="#003087" />
                          ) : (
                            <>
                              <RefreshCw size={12} color="#003087" />
                              <Text style={[styles.connectButtonText, { color: '#003087' }]}>Sync</Text>
                            </>
                          )}
                        </Pressable>
                        <Pressable style={styles.disconnectButton} onPress={handleDisconnectPayPal}>
                          <Unlink size={14} color="#ef4444" />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable 
                        style={[styles.connectButton, { backgroundColor: '#00308715' }, isPaypalLoading && styles.buttonDisabled]}
                        onPress={handleConnectPayPal}
                        disabled={isPaypalLoading}
                      >
                        {isPaypalLoading ? (
                          <ActivityIndicator size="small" color="#003087" />
                        ) : (
                          <>
                            <ExternalLink size={12} color="#003087" />
                            <Text style={[styles.connectButtonText, { color: '#003087' }]}>Verbinden</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
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

          {/* Cloud Sync Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <RefreshCw size={16} color="#6b7280" />
              <Text style={styles.sectionTitle}>Cloud-Backup</Text>
            </View>
            
            <View style={styles.syncCard}>
              <View style={styles.syncStatusHeader}>
                <View style={[styles.statusDot, { backgroundColor: isSupabaseConfigured ? '#22c55e' : '#f59e0b' }]} />
                <Text style={styles.syncStatusText}>
                  {isSupabaseConfigured ? 'Cloud-Backup aktiv' : 'Cloud-Backup nicht konfiguriert'}
                </Text>
              </View>

              <Text style={styles.syncHint}>
                {isSupabaseConfigured 
                  ? 'Deine Daten (PayPal-Importe, Kategorien und Regeln) werden automatisch mit deiner privaten Cloud synchronisiert.'
                  : 'Bitte trage deine Supabase-Zugangsdaten in die .env Datei ein, um das automatische Backup zu aktivieren.'}
              </Text>
              
              {isSupabaseConfigured && (
                <Pressable 
                  style={styles.manualSyncButton}
                  onPress={async () => {
                    setIsLoading(true);
                    try {
                      await storageService.initialize(true);
                      await categorizationService.initialize(true);
                      await refreshData();
                      Alert.alert('Erfolg', 'Daten wurden erfolgreich mit der Cloud synchronisiert.');
                    } catch (error) {
                      Alert.alert('Fehler', 'Synchronisation fehlgeschlagen.');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                >
                  <RefreshCw size={14} color="#0066b3" />
                  <Text style={styles.manualSyncButtonText}>Jetzt synchronisieren</Text>
                </Pressable>
              )}
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
              <Pressable 
                style={styles.clearCacheButton}
                onPress={async () => {
                  const title = 'Cache löschen';
                  const message = 'Alle lokalen Daten werden gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.';
                  
                  if (typeof window !== 'undefined' && window.confirm) {
                    if (window.confirm(`${title}\n\n${message}`)) {
                      await storageService.clearAll();
                      alert('Cache wurde gelöscht. Die Seite wird nun neu geladen.');
                      window.location.reload();
                    }
                  } else {
                    Alert.alert(
                      title,
                      message,
                      [
                        { text: 'Abbrechen', style: 'cancel' },
                        {
                          text: 'Löschen',
                          style: 'destructive',
                          onPress: async () => {
                            await storageService.clearAll();
                            Alert.alert('Erfolg', 'Cache wurde gelöscht.');
                            onClose();
                          },
                        },
                      ]
                    );
                  }
                }}
              >
                <Trash2 size={14} color="#ef4444" />
                <Text style={styles.clearCacheText}>Cache löschen</Text>
              </Pressable>
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
  // Bank form styles
  bankForm: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 16,
    marginTop: 8,
  },
  bankFormTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
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
  syncStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  manualSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 8,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
  },
  manualSyncButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066b3',
  },
  syncHint: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 8,
    lineHeight: 14,
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
});
