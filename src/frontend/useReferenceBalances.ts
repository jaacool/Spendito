// File: src/frontend/useReferenceBalances.ts
import { useState } from 'react';
import { SourceAccount } from '../types';
import { storageService } from '../services/storage';
import { showMessage } from '../services/dialogs';

/**
 * Input state for "Aktuelle Kontostände" (reference balances for the export).
 */
export function useReferenceBalances(
  saveBalance: (account: SourceAccount, amount: number) => Promise<void>
) {
  const [inputs, setInputs] = useState<Record<SourceAccount, string>>({ volksbank: '', paypal: '' });

  const load = () => {
    const format = (account: SourceAccount) => {
      const ref = storageService.getReferenceBalance(account);
      return ref ? ref.amount.toFixed(2).replace('.', ',') : '';
    };
    setInputs({ volksbank: format('volksbank'), paypal: format('paypal') });
  };

  const setInput = (account: SourceAccount, value: string) =>
    setInputs(prev => ({ ...prev, [account]: value }));

  const save = async (account: SourceAccount) => {
    // German input: "1.234,56" -> 1234.56
    const normalized = inputs[account].trim().replace(/\./g, '').replace(',', '.');
    const amount = Number(normalized);
    if (!normalized || !Number.isFinite(amount)) {
      await showMessage('Fehler', 'Bitte gib einen gültigen Betrag ein (z.B. 1.234,56).');
      return;
    }
    try {
      await saveBalance(account, amount);
      await showMessage('Gespeichert', 'Kontostand wurde gespeichert.');
    } catch (error) {
      console.error('[Settings] Saving balance failed:', error);
      await showMessage('Fehler', 'Der Kontostand konnte nicht gespeichert werden.');
    }
  };

  return { inputs, setInput, save, load };
}
