// File: src/frontend/useBackup.ts
import { useState } from 'react';
import { backupService } from '../services/backup';
import { showMessage } from '../services/dialogs';

/**
 * "Datensicherung": export / import of all app data and the raw DB export.
 */
export function useBackup(refreshData: () => Promise<void>, exportDatabase: () => Promise<void>) {
  const [isBusy, setIsBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      // Services already throw German messages
      await showMessage('Fehler', error instanceof Error ? error.message : 'Unbekannter Fehler');
    } finally {
      setIsBusy(false);
    }
  };

  const exportBackup = () => run(() => backupService.exportData());

  const importBackup = () => run(async () => {
    const result = await backupService.importData();
    if (result.success) {
      await refreshData();
      await showMessage('Import erfolgreich', result.message);
    } else if (result.message !== 'Import abgebrochen') {
      await showMessage('Hinweis', result.message);
    }
  });

  const exportRawDatabase = () => run(async () => {
    try {
      await exportDatabase();
    } catch {
      throw new Error('Der DB-Export ist fehlgeschlagen.');
    }
  });

  return { isBusy, exportBackup, importBackup, exportRawDatabase };
}
