// File: src/components/settings/ConnectionsSection.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Link, FileText, Upload, Wallet, CheckCircle2, RefreshCw, Unlink } from 'lucide-react-native';
import { settingsStyles as styles } from './settingsStyles';

interface ConnectionsSectionProps {
  // CSV import
  isCsvImporting: boolean;
  csvImportResult: string | null;
  onPickCsv: () => void;
  // PayPal
  paypalConfigured: boolean;
  paypalConnected: boolean;
  isPaypalBusy: boolean;
  onPayPalConnect: () => void;
  onPayPalSync: () => void;
  onPayPalDisconnect: () => void;
}

/** "Kontoverbindungen": Volksbank CSV import and PayPal */
export function ConnectionsSection(props: ConnectionsSectionProps) {
  const { paypalConfigured, paypalConnected, isPaypalBusy } = props;

  return (
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
        <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#10b98115' }]} onPress={props.onPickCsv} disabled={props.isCsvImporting}>
          {props.isCsvImporting ? <ActivityIndicator size="small" color="#10b981" /> : (
            <><Upload size={12} color="#10b981" /><Text style={[styles.connectButtonText, { color: '#10b981' }]}>CSV laden</Text></>
          )}
        </TouchableOpacity>
      </View>
      {props.csvImportResult && (
        <Text style={styles.importResultText}>{props.csvImportResult}</Text>
      )}

      {/* PayPal Connection */}
      <View style={styles.connectionCard}>
        <View style={styles.connectionInfo}>
          <View style={[styles.connectionIcon, { backgroundColor: '#00308715' }]}>
            <Wallet size={18} color="#003087" />
          </View>
          <View style={styles.connectionDetails}>
            <Text style={styles.connectionName}>PayPal</Text>
            {paypalConnected ? (
              <View style={styles.connectedBadge}><CheckCircle2 size={10} color="#22c55e" /><Text style={styles.connectedText}>Verbunden</Text></View>
            ) : <Text style={styles.disconnectedText}>{paypalConfigured ? 'Nicht verbunden' : 'Nicht konfiguriert'}</Text>}
          </View>
        </View>
        {paypalConfigured && (
          <View style={styles.paypalButtons}>
            {paypalConnected ? (
              <>
                <Pressable style={[styles.syncButton, isPaypalBusy && styles.buttonDisabled]} onPress={props.onPayPalSync} disabled={isPaypalBusy}>
                  {isPaypalBusy ? <ActivityIndicator size="small" color="#003087" /> : (
                    <><RefreshCw size={12} color="#003087" /><Text style={[styles.connectButtonText, { color: '#003087' }]}>Sync</Text></>
                  )}
                </Pressable>
                <Pressable style={styles.disconnectButton} onPress={props.onPayPalDisconnect} disabled={isPaypalBusy}>
                  <Unlink size={14} color="#ef4444" />
                </Pressable>
              </>
            ) : (
              <Pressable style={[styles.connectButton, { backgroundColor: '#00308715' }, isPaypalBusy && styles.buttonDisabled]} onPress={props.onPayPalConnect} disabled={isPaypalBusy}>
                {isPaypalBusy ? <ActivityIndicator size="small" color="#003087" /> : (
                  <><Link size={12} color="#003087" /><Text style={[styles.connectButtonText, { color: '#003087' }]}>Verbinden</Text></>
                )}
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
