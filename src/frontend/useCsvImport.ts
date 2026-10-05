// File: src/frontend/useCsvImport.ts
import { useState } from 'react';
import { Platform } from 'react-native';
import { csvImportService } from '../services/csvImport';
import { storageService } from '../services/storage';
import { showMessage } from '../services/dialogs';

/**
 * Volksbank CSV import: pick file, decode, import, restore lost texts and
 * report every skipped row to the user.
 */
export function useCsvImport(refreshData: () => Promise<void>) {
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setIsImporting(true);
    setResult(null);
    try {
      // Read bytes and detect encoding (UTF-8 or Windows-1252), so umlauts stay intact
      const content = csvImportService.decodeCSVBuffer(await file.arrayBuffer());
      const imported = await csvImportService.importVolksbankCSV(content, storageService.getTransactions(), {});

      if (!imported.success) {
        setResult(`Import fehlgeschlagen:\n${imported.errors.join('\n')}`);
        return;
      }

      const saveResult = imported.transactions.length > 0
        ? await storageService.importTransactions(imported.transactions)
        : { added: 0, duplicates: 0 };
      const restoredCount = await storageService.restoreDescriptions(imported.restoredDescriptions);

      // Summary for the user - skipped rows are always shown, never hidden
      const lines = [
        `✓ ${saveResult.added} neue Buchungen importiert`,
        `${imported.skippedDuplicates + saveResult.duplicates} bereits vorhandene Buchungen übersprungen`,
      ];
      if (restoredCount > 0) lines.push(`${restoredCount} Verwendungszwecke wiederhergestellt`);
      if (imported.errors.length > 0) {
        lines.push('', `⚠ ${imported.errors.length} Zeilen konnten nicht gelesen werden:`, ...imported.errors);
      }
      const message = lines.join('\n');
      setResult(message);

      if (saveResult.added > 0 || restoredCount > 0) {
        await refreshData();
      }
      await showMessage('CSV Import abgeschlossen', message);
    } catch (error) {
      console.error('[CSV] Import error:', error instanceof Error ? error.name : 'Error');
      setResult('Fehler beim Import: Die Datei konnte nicht verarbeitet werden. Bitte prüfe, ob es der CSV-Export der Volksbank ist.');
    } finally {
      setIsImporting(false);
    }
  };

  const pickFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      showMessage('Hinweis', 'Der CSV-Import ist derzeit nur im Browser verfügbar.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement | null)?.files?.[0];
      if (file) processFile(file);
    };
    input.click();
  };

  return { isImporting, result, pickFile };
}
