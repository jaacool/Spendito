// File: src/frontend/useAiKey.ts
import { useState } from 'react';
import { secureStorageService } from '../services/secureStorage';
import { askConfirm, showMessage } from '../services/dialogs';

/**
 * Gemini API key: enter, save (SecureStore / browser storage) and delete.
 */
export function useAiKey() {
  const [keyInput, setKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setHasKey(await secureStorageService.hasApiKey());
    } catch {
      setHasKey(false);
    }
  };

  const save = async () => {
    const key = keyInput.trim();
    if (!key) {
      await showMessage('Fehler', 'Bitte gib einen gültigen API-Key ein.');
      return;
    }
    setIsSaving(true);
    try {
      await secureStorageService.saveApiKey(key);
      setKeyInput('');
      await load();
      await showMessage('Gespeichert', 'Der KI-Schlüssel wurde gespeichert.');
    } catch {
      await showMessage('Fehler', 'Der Schlüssel konnte nicht gespeichert werden.');
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    const confirmed = await askConfirm(
      'Key löschen',
      'Möchtest du den gespeicherten KI API-Key wirklich entfernen?',
      'Löschen',
      true
    );
    if (!confirmed) return;
    try {
      await secureStorageService.deleteApiKey();
      await load();
    } catch {
      await showMessage('Fehler', 'Der Schlüssel konnte nicht gelöscht werden.');
    }
  };

  return { keyInput, setKeyInput, hasKey, isSaving, load, save, remove };
}
