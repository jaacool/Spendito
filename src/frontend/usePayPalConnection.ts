// File: src/frontend/usePayPalConnection.ts
import { useState } from 'react';
import { backendApiService } from '../services/backendApi';
import { storageService } from '../services/storage';
import { askConfirm, showMessage } from '../services/dialogs';

export interface PayPalStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}

/**
 * PayPal connection: status, connect (OAuth popup), sync and disconnect.
 */
export function usePayPalConnection(refreshData: () => Promise<void>) {
  const [status, setStatus] = useState<PayPalStatus | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadStatus = async () => {
    try {
      setStatus(await backendApiService.getPayPalStatus());
    } catch (error) {
      console.error('[PayPal] Loading status failed');
    }
  };

  const connect = async () => {
    setIsBusy(true);
    try {
      await backendApiService.connectPayPal();
      await loadStatus();
    } catch (error: any) {
      const pending = /pending|approval/i.test(error?.message || '');
      await showMessage(
        pending ? 'PayPal Genehmigung ausstehend' : 'PayPal Verbindung',
        pending
          ? 'Die PayPal-Integration wartet noch auf Genehmigung durch PayPal. Bitte versuche es später erneut.'
          : 'Die PayPal-Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es erneut.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const sync = async () => {
    setIsBusy(true);
    try {
      const result = await backendApiService.syncPayPal();
      if (result.needsAuth) {
        setIsBusy(false);
        const reconnect = await askConfirm('PayPal nicht verbunden', 'Bitte verbinde zuerst dein PayPal-Konto.', 'Verbinden');
        if (reconnect) await connect();
        return;
      }

      const transactions = result.transactions || [];
      if (transactions.length > 0) {
        const importResult = await storageService.importTransactions(transactions);
        await refreshData();
        await showMessage(
          'PayPal Sync erfolgreich',
          `${importResult.added} neue Buchungen importiert\n${importResult.duplicates} bereits vorhandene übersprungen`
        );
      } else {
        await showMessage('PayPal Sync', 'Keine neuen Buchungen gefunden.');
      }
      await loadStatus();
    } catch (error: any) {
      console.error('[PayPal] Sync failed');
      await showMessage('Fehler', error?.message || 'PayPal Sync fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setIsBusy(false);
    }
  };

  const disconnect = async () => {
    // Only the PayPal login is removed - imported bookings stay in the app
    const confirmed = await askConfirm(
      'PayPal trennen',
      'Möchtest du die Verbindung zu PayPal wirklich trennen? Bereits importierte Buchungen bleiben erhalten.',
      'Trennen',
      true
    );
    if (!confirmed) return;

    setIsBusy(true);
    try {
      await backendApiService.disconnectPayPal();
      await loadStatus();
      await showMessage('Getrennt', 'PayPal wurde getrennt.');
    } catch {
      await showMessage('Fehler', 'Trennen fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setIsBusy(false);
    }
  };

  return { status, isBusy, loadStatus, connect, sync, disconnect };
}
