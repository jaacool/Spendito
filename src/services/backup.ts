import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

const BACKUP_VERSION = '1.0.0';

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
      const relevantKeys = allKeys.filter(key => 
        key.startsWith('@spendito_') || 
        key.startsWith('bank_') || 
        key.startsWith('backend_') ||
        key === 'paypal_connected'
      );

      const pairs = await AsyncStorage.multiGet(relevantKeys);
      const storageData: Record<string, string | null> = {};
      
      pairs.forEach(([key, value]) => {
        storageData[key] = value;
      });

      const backup: BackupData = {
        version: BACKUP_VERSION,
        timestamp: new Date().toISOString(),
        storage: storageData
      };

      const jsonString = JSON.stringify(backup, null, 2);
      const fileName = `spendito_backup_${new Date().toISOString().split('T')[0]}.json`;

      if (Platform.OS === 'web') {
        // Web Export (Electron nutzt oft Web-APIs)
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // Native Export (iOS/Android/Electron via FileSystem)
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, jsonString, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      throw new Error('Export fehlgeschlagen: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Importiert Daten aus einer JSON-Datei
   */
  async importData(): Promise<{ success: boolean; message: string }> {
    console.log('[Backup] importData() called');
    try {
      console.log('[Backup] Opening DocumentPicker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      console.log('[Backup] DocumentPicker result:', JSON.stringify(result, null, 2));
      
      if (result.canceled) {
        console.log('[Backup] User canceled the picker');
        return { success: false, message: 'Import abgebrochen' };
      }

      const asset = result.assets[0];
      console.log('[Backup] Selected asset:', asset.name, 'URI:', asset.uri, 'File:', !!asset.file);
      
      let jsonContent: string;

      if (Platform.OS === 'web') {
        console.log('[Backup] Platform is web, trying to read file...');
        // In Electron/Web, we can use the file object or fetch the URI
        if (asset.file) {
          console.log('[Backup] Using asset.file.text()');
          jsonContent = await asset.file.text();
        } else {
          console.log('[Backup] Using fetch() for URI:', asset.uri);
          const response = await fetch(asset.uri);
          jsonContent = await response.text();
        }
      } else {
        console.log('[Backup] Platform is native, using FileSystem');
        jsonContent = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      console.log('[Backup] JSON content length:', jsonContent.length);
      console.log('[Backup] JSON preview:', jsonContent.substring(0, 200));

      let backup: BackupData;
      try {
        backup = JSON.parse(jsonContent);
        console.log('[Backup] Parsed backup, version:', backup.version, 'keys:', Object.keys(backup.storage || {}).length);
      } catch (e) {
        console.error('[Backup] JSON parse error:', e);
        throw new Error('Datei konnte nicht als JSON gelesen werden. Ist es ein gültiges Backup?');
      }

      // Sanity Check
      if (!backup.version || !backup.storage) {
        console.error('[Backup] Invalid backup format - missing version or storage');
        throw new Error('Ungültiges Backup-Format');
      }

      // Daten in AsyncStorage schreiben
      const entries = Object.entries(backup.storage);
      const pairs: [string, string][] = entries
        .filter(([_, value]) => value !== null)
        .map(([key, value]) => [key, value as string]);

      console.log('[Backup] Writing', pairs.length, 'entries to AsyncStorage');

      if (pairs.length > 0) {
        await AsyncStorage.multiSet(pairs);
        console.log('[Backup] AsyncStorage.multiSet completed successfully');
        return { 
          success: true, 
          message: `${pairs.length} Datensätze erfolgreich importiert. Bitte starte die App neu.` 
        };
      }

      console.log('[Backup] No data found in backup');
      return { success: false, message: 'Keine Daten im Backup gefunden' };
    } catch (error) {
      console.error('[Backup] Import failed with error:', error);
      throw new Error('Import fehlgeschlagen: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}

export const backupService = new BackupService();
