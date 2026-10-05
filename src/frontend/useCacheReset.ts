// File: src/frontend/useCacheReset.ts
import { useState } from 'react';
import { Platform } from 'react-native';
import { storageService } from '../services/storage';
import { showMessage } from '../services/dialogs';

export type CacheResetStep = 1 | 2 | 3;

/**
 * "Cache löschen" with three confirmation steps. Deletes ALL bookings.
 */
export function useCacheReset(refreshData: () => Promise<void>, onDone: () => void) {
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [step, setStep] = useState<CacheResetStep>(1);

  const open = () => {
    setStep(1);
    setIsWarningOpen(true);
  };

  const cancel = () => {
    setIsWarningOpen(false);
    setStep(1);
  };

  const next = async () => {
    if (step < 3) {
      setStep((step + 1) as CacheResetStep);
      return;
    }
    setIsWarningOpen(false);
    try {
      await storageService.clearAll();
    } catch {
      await showMessage('Fehler', 'Die Daten konnten nicht gelöscht werden.');
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      await showMessage('Gelöscht', 'Cache wurde gelöscht. Die Seite wird nun neu geladen.');
      window.location.reload();
      return;
    }
    // Phone: reload the app state, otherwise the old data stays visible
    await refreshData();
    await showMessage('Gelöscht', 'Cache wurde gelöscht.');
    onDone();
  };

  return { isWarningOpen, step, open, cancel, next };
}
