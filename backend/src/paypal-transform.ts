// File: backend/src/paypal-transform.ts
/**
 * Maps raw PayPal reporting-API entries to the transaction shape the
 * Spendito client expects (snake_case, unchanged from previous versions).
 */

export interface ProxiedTransaction {
  id: string;
  external_id: string;
  date: string;
  value_date: string;
  amount: number;
  currency: string;
  counterparty_name: string;
  counterparty_iban: string | null;
  description: string;
  booking_text: string;
  bank_id: 'paypal';
  account_number: 'paypal';
}

const EVENT_CODE_DESCRIPTIONS: Record<string, string> = {
  T0000: 'PayPal Zahlung',
  T0001: 'PayPal Zahlung erhalten',
  T0002: 'PayPal Zahlung gesendet',
  T0003: 'PayPal Vorautorisierung',
  T0004: 'PayPal Rückerstattung',
  T0005: 'PayPal Zahlung',
  T0006: 'PayPal Zahlung',
  T0007: 'PayPal Website-Zahlung',
  T0008: 'PayPal Abo-Zahlung',
  T0009: 'PayPal Abo-Zahlung',
  T0010: 'PayPal Rückbuchung',
  T0011: 'PayPal Rückbuchung',
  T0300: 'PayPal Guthaben-Transfer',
  T0400: 'PayPal Allgemeine Zahlung',
  T0500: 'PayPal Allgemeine Zahlung',
  T0700: 'PayPal Allgemeine Gutschrift',
  T0800: 'PayPal Bonus/Gutschrift',
  T0900: 'PayPal Gebühr',
  T1000: 'PayPal Rückbuchung',
  T1100: 'PayPal Währungsumrechnung',
  T1200: 'PayPal Währungsumrechnung',
  T1300: 'PayPal Anpassung',
  T1400: 'PayPal Kredit',
  T1500: 'PayPal Auszahlung',
  T1600: 'PayPal Einzahlung',
  T1700: 'PayPal Auszahlung',
  T1800: 'PayPal Einzahlung',
  T1900: 'PayPal Anpassung',
  T2000: 'PayPal Reservierung',
  T2100: 'PayPal Reservierung',
  T2200: 'PayPal Reservierung',
  T9700: 'PayPal Zahlung',
  T9800: 'PayPal Zahlung',
  T9900: 'PayPal Allgemein',
};

export function transformPayPalTransactions(rawTransactions: any[]): ProxiedTransaction[] {
  const result: ProxiedTransaction[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const tx of rawTransactions) {
    const txInfo = tx?.transaction_info || {};
    const payerInfo = tx?.payer_info || {};
    const eventCode: string = txInfo.transaction_event_code || '';

    // Skip currency conversions
    if (eventCode.startsWith('T11') || eventCode.startsWith('T12')) {
      continue;
    }

    const externalId: string = txInfo.transaction_id || `pp_${Date.now()}_${Math.random()}`;
    const date: string | undefined = txInfo.transaction_initiation_date || txInfo.transaction_updated_date;
    const parsedAmount = parseFloat(txInfo.transaction_amount?.value || '0');
    const amount = Number.isFinite(parsedAmount) ? parsedAmount : 0;
    const currency: string = txInfo.transaction_amount?.currency_code || 'EUR';

    const counterpartyName: string =
      payerInfo.payer_name?.alternate_full_name ||
      payerInfo.payer_name?.given_name ||
      txInfo.payee_info?.payee_name?.alternate_full_name ||
      'PayPal';

    let description: string = txInfo.transaction_subject || txInfo.transaction_note;
    if (!description || description === eventCode) {
      description =
        EVENT_CODE_DESCRIPTIONS[eventCode.substring(0, 5)] ||
        EVENT_CODE_DESCRIPTIONS[eventCode] ||
        (counterpartyName !== 'PayPal' ? `PayPal: ${counterpartyName}` : 'PayPal Transaktion');
    }

    const day = date ? date.split('T')[0] : today;
    result.push({
      id: externalId,
      external_id: externalId,
      date: day,
      value_date: day,
      amount,
      currency,
      counterparty_name: counterpartyName,
      counterparty_iban: payerInfo.email_address || null,
      description,
      booking_text: `PayPal: ${eventCode}`,
      bank_id: 'paypal',
      account_number: 'paypal',
    });
  }

  return result;
}
