// File: src/components/settings/BackupSection.tsx
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Download, Upload, Database } from 'lucide-react-native';
import { settingsStyles as styles } from './settingsStyles';

interface BackupSectionProps {
  isBusy: boolean;
  onExport: () => void;
  onImport: () => void;
  onExportDatabase: () => void;
}

/** "Datensicherung": Export / Import / DB Export */
export function BackupSection({ isBusy, onExport, onImport, onExportDatabase }: BackupSectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Download size={16} color="#6b7280" />
        <Text style={styles.sectionTitle}>Datensicherung</Text>
      </View>
      <View style={styles.backupButtonsContainer}>
        <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#6366f115' }]} onPress={onExport} disabled={isBusy}>
          <Download size={12} color="#6366f1" />
          <Text style={[styles.connectButtonText, { color: '#6366f1' }]}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#8b5cf615' }]} onPress={onImport} disabled={isBusy}>
          {isBusy ? <ActivityIndicator size="small" color="#8b5cf6" /> : (
            <><Upload size={12} color="#8b5cf6" /><Text style={[styles.connectButtonText, { color: '#8b5cf6' }]}>Import</Text></>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.connectButton, { backgroundColor: '#f59e0b15' }]} onPress={onExportDatabase} disabled={isBusy}>
          <Database size={12} color="#f59e0b" />
          <Text style={[styles.connectButtonText, { color: '#f59e0b' }]}>DB Export</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
