// File: src/components/SettingsModal.tsx
import React, { useEffect } from 'react';
import { View, Text, Modal, Pressable, ScrollView } from 'react-native';
import { X, Trash2 } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useSettings } from '../context/SettingsContext';
import { useApp } from '../context/AppContext';
import { useReferenceBalances } from '../frontend/useReferenceBalances';
import { useAiKey } from '../frontend/useAiKey';
import { useCsvImport } from '../frontend/useCsvImport';
import { useBackup } from '../frontend/useBackup';
import { usePayPalConnection } from '../frontend/usePayPalConnection';
import { useCacheReset } from '../frontend/useCacheReset';
import { ReferenceBalanceSection } from './settings/ReferenceBalanceSection';
import { BackupSection } from './settings/BackupSection';
import { ConnectionsSection } from './settings/ConnectionsSection';
import { AiKeySection } from './settings/AiKeySection';
import { DisplaySection } from './settings/DisplaySection';
import { CacheResetDialog } from './settings/CacheResetDialog';
import { settingsStyles as styles } from './settings/settingsStyles';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Settings dialog. Only wires the logic hooks (src/frontend) to the
 * section components (src/components/settings) - no logic in here.
 */
export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { uiScale, setUIScale } = useSettings();
  const { refreshData, setReferenceBalance, cleanupTransactions, exportDatabase } = useApp();

  const balances = useReferenceBalances(setReferenceBalance);
  const aiKey = useAiKey();
  const csvImport = useCsvImport(refreshData);
  const backup = useBackup(refreshData, exportDatabase);
  const paypal = usePayPalConnection(refreshData);
  const cacheReset = useCacheReset(refreshData, onClose);

  useEffect(() => {
    if (isOpen) {
      paypal.loadStatus();
      balances.load();
      aiKey.load();
      cleanupTransactions().catch(() => {}); // Fix account assignment of old bookings
    }
  }, [isOpen]);

  const appVersion = Constants.expoConfig?.version || '1.0.0';

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
            <ReferenceBalanceSection inputs={balances.inputs} onChange={balances.setInput} onSave={balances.save} />

            <BackupSection
              isBusy={backup.isBusy}
              onExport={backup.exportBackup}
              onImport={backup.importBackup}
              onExportDatabase={backup.exportRawDatabase}
            />

            <ConnectionsSection
              isCsvImporting={csvImport.isImporting}
              csvImportResult={csvImport.result}
              onPickCsv={csvImport.pickFile}
              paypalConfigured={!!paypal.status?.configured}
              paypalConnected={!!paypal.status?.connected}
              isPaypalBusy={paypal.isBusy}
              onPayPalConnect={paypal.connect}
              onPayPalSync={paypal.sync}
              onPayPalDisconnect={paypal.disconnect}
            />

            <AiKeySection
              hasKey={aiKey.hasKey}
              keyInput={aiKey.keyInput}
              isSaving={aiKey.isSaving}
              onKeyInputChange={aiKey.setKeyInput}
              onSave={aiKey.save}
              onDelete={aiKey.remove}
            />

            <DisplaySection scale={uiScale} onScaleChange={setUIScale} />

            {/* Version + Cache löschen */}
            <View style={styles.versionSection}>
              <Text style={styles.versionText}>Spendito v{appVersion}</Text>
              <Pressable style={styles.clearCacheButton} onPress={cacheReset.open}>
                <Trash2 size={14} color="#ef4444" />
                <Text style={styles.clearCacheText}>Cache löschen</Text>
              </Pressable>
            </View>
          </ScrollView>

          <CacheResetDialog
            visible={cacheReset.isWarningOpen}
            step={cacheReset.step}
            onCancel={cacheReset.cancel}
            onConfirm={cacheReset.next}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
