import { Router } from 'express';
import { FinTSClient, FinTSConfig } from 'lib-fints';
import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Store active FinTS sessions (in production, use Redis or similar)
const activeSessions: Map<string, { client: FinTSClient; connectionId: string }> = new Map();

// FinTS Product ID - register at https://www.hbci-zka.de/ for production
const PRODUCT_ID = process.env.FINTS_PRODUCT_ID || '9FA6681DEC0CF3046BFC2F8A6';
const PRODUCT_VERSION = '1.0.0';

// Atruvia FinTS endpoints (new URLs since March 2024)
// fints2 = former Fiducia banks (South Germany, Bayern, etc.)
// fints1 = former GAD banks (North Germany)
const ATRUVIA_FINTS2 = 'https://fints2.atruvia.de/cgi-bin/hbciservlet';
const ATRUVIA_FINTS1 = 'https://fints1.atruvia.de/cgi-bin/hbciservlet';

// BLZ ranges for routing to correct server
// Bayern/Baden-Württemberg (7xxxxxxx, 6xxxxxxx) -> fints2
// Rest of Germany -> fints1
function getFinTSUrl(blz: string): string {
  const prefix = blz.charAt(0);
  // Süddeutsche Banken (BLZ beginnt mit 6 oder 7) -> fints2
  if (prefix === '6' || prefix === '7') {
    return ATRUVIA_FINTS2;
  }
  // Norddeutsche Banken -> fints1
  return ATRUVIA_FINTS1;
}

/**
 * Initialize FinTS connection and get available TAN methods
 */
router.post('/init', async (req, res) => {
  const { userId, bankId, bankUrl, loginName, pin } = req.body;

  if (!userId || !bankId || !loginName || !pin) {
    return res.status(400).json({ error: 'Missing required fields: userId, bankId, loginName, pin' });
  }

  // Use provided URL or auto-detect based on BLZ
  const finalBankUrl = bankUrl || getFinTSUrl(bankId);
  console.log(`[FinTS] Using server: ${finalBankUrl} for BLZ: ${bankId}`);

  try {
    // Create FinTS config for first-time use
    const config = FinTSConfig.forFirstTimeUse(
      PRODUCT_ID,
      PRODUCT_VERSION,
      finalBankUrl,
      bankId,
      loginName,
      pin
    );

    const client = new FinTSClient(config);

    // First sync to get BPD (Bank Parameter Data)
    console.log(`[FinTS] Initializing connection to bank ${bankId}...`);
    const syncResponse = await client.synchronize();

    if (!syncResponse.success) {
      const errorMsg = syncResponse.bankAnswers
        ?.map((a: any) => a.text || a.message)
        .join('; ') || 'Synchronization failed';
      return res.status(400).json({ error: errorMsg });
    }

    // Store connection in database
    const connectionId = uuidv4();
    const sessionId = uuidv4();

    db.prepare(`
      INSERT INTO bank_connections (id, user_id, bank_id, bank_name, bank_url, login_name, system_id, banking_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      connectionId,
      userId,
      bankId,
      'Volksbank',
      finalBankUrl,
      loginName,
      syncResponse.bankingInformation?.systemId || null,
      JSON.stringify(syncResponse.bankingInformation)
    );

    // Store session for TAN method selection
    activeSessions.set(sessionId, { client, connectionId });

    // Get available TAN methods
    const bpd = syncResponse.bankingInformation?.bpd as any;
    const tanMethods = bpd?.availableTanMethodIds || [];

    res.json({
      sessionId,
      connectionId,
      tanMethods: tanMethods.map((id: any) => ({ id: String(id), name: `TAN Method ${id}` })),
      message: 'Connection initialized. Select a TAN method to continue.',
      nextStep: 'selectTanMethod'
    });

  } catch (error: any) {
    console.error('[FinTS] Init error:', error);
    console.error('[FinTS] Error stack:', error.stack);
    
    // Provide more helpful error messages
    let errorMessage = error.message || 'Unbekannter Fehler';
    
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'Bankserver nicht erreichbar. Bitte prüfe die BLZ.';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      errorMessage = 'Zeitüberschreitung beim Verbinden mit der Bank.';
    } else if (errorMessage.includes('9800') || errorMessage.includes('9010')) {
      errorMessage = 'Anmeldedaten falsch. Bitte prüfe Login und PIN.';
    } else if (errorMessage.includes('9930') || errorMessage.includes('9931')) {
      errorMessage = 'Konto gesperrt oder zu viele Fehlversuche.';
    } else if (errorMessage.includes('certificate')) {
      errorMessage = 'SSL-Zertifikatsfehler beim Bankserver.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Select TAN method and sync accounts
 */
router.post('/select-tan-method', async (req, res) => {
  const { sessionId, tanMethodId } = req.body;

  if (!sessionId || !tanMethodId) {
    return res.status(400).json({ error: 'Missing sessionId or tanMethodId' });
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  try {
    const { client, connectionId } = session;

    // Check available TAN methods
    const availableMethods = client.config.availableTanMethods || [];
    console.log('[FinTS] Available TAN methods:', JSON.stringify(availableMethods, null, 2));
    
    // Try to select TAN method
    try {
      client.selectTanMethod(Number(tanMethodId));
    } catch (tanError: any) {
      console.error('[FinTS] TAN method selection error:', tanError.message);
      
      // Check if this is a decoupled TAN method (like 946 = VR-SecureGo Plus)
      // These methods require app-based approval without entering a TAN
      if (tanError.message.includes('not supported')) {
        return res.status(400).json({ 
          error: `TAN-Verfahren ${tanMethodId} wird von dieser App noch nicht unterstützt. Bitte nutze ein anderes TAN-Verfahren (z.B. SMS-TAN oder chipTAN) oder warte auf ein Update.`,
          details: 'Decoupled TAN methods like VR-SecureGo Plus (946) require special handling that is not yet implemented.',
          availableMethods: availableMethods.map((m: any) => ({ id: m.id, name: m.name }))
        });
      }
      throw tanError;
    }

    // Update connection with selected TAN method
    db.prepare(`
      UPDATE bank_connections SET selected_tan_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(tanMethodId, connectionId);

    // Second sync to get UPD (User Parameter Data) with accounts
    console.log(`[FinTS] Syncing with TAN method ${tanMethodId}...`);
    const syncResponse = await client.synchronize();

    if (syncResponse.requiresTan) {
      // TAN challenge received
      const challengeId = uuidv4();
      const challenge = syncResponse.tanChallenge;

      db.prepare(`
        INSERT INTO tan_challenges (id, connection_id, challenge_type, challenge_text, status)
        VALUES (?, ?, 'sync', ?, 'pending')
      `).run(challengeId, connectionId, typeof challenge === 'string' ? challenge : (challenge as any)?.challengeText || 'TAN required');

      return res.json({
        sessionId,
        connectionId,
        challengeId,
        requiresTan: true,
        tanChallenge: typeof challenge === 'string' ? challenge : (challenge as any)?.challengeText,
        message: 'Please enter TAN',
        nextStep: 'submitTan'
      });
    }

    if (!syncResponse.success) {
      const errorMsg = syncResponse.bankAnswers
        ?.map((a: any) => a.text || a.message)
        .join('; ') || 'Sync failed';
      return res.status(400).json({ error: errorMsg });
    }

    // Store accounts
    const upd = syncResponse.bankingInformation?.upd as any;
    const accounts = upd?.bankAccounts || [];
    const storedAccounts = [];

    for (const acc of accounts as any[]) {
      const accountId = uuidv4();
      db.prepare(`
        INSERT INTO bank_accounts (id, connection_id, account_number, iban, bic, account_name, account_type, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        accountId,
        connectionId,
        acc.accountNumber,
        acc.iban || null,
        acc.bic || null,
        acc.accountName || acc.accountDescription || null,
        acc.accountType || null,
        acc.currency || 'EUR'
      );
      storedAccounts.push({ id: accountId, ...acc });
    }

    res.json({
      sessionId,
      connectionId,
      accounts: storedAccounts,
      message: 'Accounts synced successfully',
      nextStep: 'fetchTransactions'
    });

  } catch (error: any) {
    console.error('[FinTS] Select TAN method error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Fetch transactions for an account
 */
router.post('/fetch-transactions', async (req, res) => {
  const { sessionId, accountId, fromDate, toDate } = req.body;

  if (!sessionId || !accountId) {
    return res.status(400).json({ error: 'Missing sessionId or accountId' });
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  // Get account info
  const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(accountId) as any;
  if (!account) {
    return res.status(404).json({ error: 'Account not found' });
  }

  try {
    const { client, connectionId } = session;

    console.log(`[FinTS] Fetching transactions for account ${account.account_number}...`);
    
    const from = fromDate ? new Date(fromDate) : undefined;
    const to = toDate ? new Date(toDate) : undefined;

    const response = await client.getAccountStatements(account.account_number, from, to);

    if (response.requiresTan) {
      const challengeId = uuidv4();
      const challenge = response.tanChallenge;

      db.prepare(`
        INSERT INTO tan_challenges (id, connection_id, challenge_type, challenge_text, challenge_data, status)
        VALUES (?, ?, 'statements', ?, ?, 'pending')
      `).run(
        challengeId,
        connectionId,
        typeof challenge === 'string' ? challenge : (challenge as any)?.challengeText || 'TAN required',
        JSON.stringify({ accountId, fromDate, toDate })
      );

      return res.json({
        sessionId,
        connectionId,
        challengeId,
        requiresTan: true,
        tanChallenge: typeof challenge === 'string' ? challenge : (challenge as any)?.challengeText,
        message: 'Please enter TAN to fetch transactions',
        nextStep: 'submitTan'
      });
    }

    if (!response.success) {
      const errorMsg = response.bankAnswers
        ?.map((a: any) => a.text || a.message)
        .join('; ') || 'Failed to fetch transactions';
      return res.status(400).json({ error: errorMsg });
    }

    // Store transactions
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions 
      (id, account_id, external_id, date, value_date, amount, currency, 
       counterparty_name, counterparty_iban, description, booking_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    const statements = (response as any).statements || [];

    for (const statement of statements as any[]) {
      for (const tx of (statement.transactions || []) as any[]) {
        const id = uuidv4();
        const externalId = tx.referenceNumber || `${tx.bookingDate || tx.date}_${tx.amount}_${tx.counterpartyName || 'unknown'}`;

        const result = stmt.run(
          id,
          accountId,
          externalId,
          tx.bookingDate || tx.date,
          tx.valueDate || tx.bookingDate || tx.date,
          tx.amount,
          tx.currency || 'EUR',
          tx.counterpartyName || null,
          tx.counterpartyIban || null,
          tx.purpose || tx.remittanceInfo || tx.description || null,
          tx.bookingText || null
        );

        if (result.changes > 0) {
          added++;
        }
      }
    }

    // Update last sync
    db.prepare(`
      UPDATE bank_connections SET last_sync = CURRENT_TIMESTAMP WHERE id = ?
    `).run(connectionId);

    // Log sync
    db.prepare(`
      INSERT INTO sync_log (connection_id, status, message, transactions_added)
      VALUES (?, 'success', 'Transactions fetched via FinTS', ?)
    `).run(connectionId, added);

    res.json({
      success: true,
      transactionsAdded: added,
      message: `${added} new transactions imported`
    });

  } catch (error: any) {
    console.error('[FinTS] Fetch transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * End session
 */
router.post('/end-session', (req, res) => {
  const { sessionId } = req.body;

  if (sessionId && activeSessions.has(sessionId)) {
    activeSessions.delete(sessionId);
  }

  res.json({ success: true, message: 'Session ended' });
});

/**
 * Get bank directory
 */
router.get('/banks', (req, res) => {
  res.json({
    endpoints: {
      'fints2 (Süddeutschland)': ATRUVIA_FINTS2,
      'fints1 (Norddeutschland)': ATRUVIA_FINTS1,
    },
    note: 'Server wird automatisch anhand der BLZ erkannt. BLZ 6xxxxx/7xxxxx -> fints2, Rest -> fints1'
  });
});

export default router;
