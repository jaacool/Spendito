// File: src/services/backup.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
// Expo SDK 54 moved the classic API (cacheDirectory, EncodingType, ...) to "legacy"
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

const BACKUP_VERSION = '1.0.0';

// Copy of the data before an import overwrote it (one step "undo" for support cases)
const PRE_IMPORT_BACKUP_KEY = 'spendito_pre_import_backup';

// Keys that belong into a backup: app data only. Access tokens, API keys and
// bank login data are deliberately NOT exported (a backup file is easily shared).
const isBackupKey = (key: string): boolean =>
  key.startsWith('@spendito_') || key === 'paypal_connected';

// Keys whose value must be a JSON array, otherwise the app would not start
const JSON_ARRAY_KEYS = ['@spendito_transactions', '@spendito_category_rules'];

interface BackupData {
  version: string;
  timestamp: string;
  storage: Record<string, string | null>;
}

class BackupService {
  /**
   * Erstellt einen Export aller relevanten AsyncStorage-Daten
   */
  async exportData(): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const pairs = await AsyncStorage.multiGet(allKeys.filter(isBackupKey));
      const storageData: Record<string, string | null> = {};
      pairs.forEach(([key, value]) => {
        storageData[key] = value;
      });

      const backup: BackupData = {
        version: BACKUP_VERSION,
        timestamp: new Date().toISOString(),
        storage: storageData,
      };

      const jsonString = JSON.stringify(backup, null, 2);
      const fileName = `spendito_backup_${new Date().toISOString().split('T')[0]}.json`;
      await this.saveFile(jsonString, fileName, 'application/json');
    } catch (error) {
      console.error('[Backup] Export failed:', error instanceof Error ? error.name : 'Error');
      throw new Error('Export fehlgeschlagen. Bitte erneut versuchen.');
    }
  }

  /**
   * Save a text file: download in the browser, share sheet on the phone.
   */
  async saveFile(content: string, fileName: string, mimeType: string): Promise<void> {
    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(fileUri, content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Teilen ist auf diesem Gerät nicht verfügbar');
    }
    await Sharing.shareAsync(fileUri, { mimeType });
  }

  /**
   * Importiert Daten aus einer JSON-Datei
   */
  async importData(): Promise<{ success: boolean; message: string }> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (result.canceled) {
      return { success: false, message: 'Import abgebrochen' };
    }

    const asset = result.assets[0];
    let jsonContent: string;
    try {
      if (Platform.OS === 'web') {
        jsonContent = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
      } else {
        jsonContent = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }
    } catch {
      throw new Error('Die Datei konnte nicht gelesen werden.');
    }

    const pairs = this.validateBackup(jsonContent);
    if (pairs.length === 0) {
      return { success: false, message: 'Keine Daten im Backup gefunden' };
    }

    // Keep the current data before overwriting it
    const currentKeys = (await AsyncStorage.getAllKeys()).filter(isBackupKey);
    const current = await AsyncStorage.multiGet(currentKeys);
    await AsyncStorage.setItem(PRE_IMPORT_BACKUP_KEY, JSON.stringify({
      timestamp: new Date().toISOString(),
      storage: Object.fromEntries(current),
    }));

    await AsyncStorage.multiSet(pairs);
    return {
      success: true,
      message: `${pairs.length} Datensätze erfolgreich importiert.`,
    };
  }

  /**
   * Check the backup file before anything is written. Only known app keys are
   * accepted, and the main data must be readable - a broken file must never
   * replace working data.
   */
  private validateBackup(jsonContent: string): [string, string][] {
    let backup: BackupData;
    try {
      backup = JSON.parse(jsonContent);
    } catch {
      throw new Error('Datei konnte nicht als JSON gelesen werden. Ist es ein gültiges Backup?');
    }

    if (!backup || typeof backup.version !== 'string' || !backup.storage || typeof backup.storage !== 'object') {
      throw new Error('Ungültiges Backup-Format');
    }

    const pairs: [string, string][] = [];
    for (const [key, value] of Object.entries(backup.storage)) {
      if (!isBackupKey(key) || typeof value !== 'string') continue;
      if (JSON_ARRAY_KEYS.includes(key)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = null;
        }
        if (!Array.isArray(parsed)) {
          throw new Error('Das Backup ist beschädigt (Buchungen oder Regeln nicht lesbar). Es wurde nichts geändert.');
        }
      }
      pairs.push([key, value]);
    }
    return pairs;
  }
}

export const backupService = new BackupService();
