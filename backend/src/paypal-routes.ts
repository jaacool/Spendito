import { Router } from 'express';
import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// PayPal API Configuration
const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // Live API
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';

interface PayPalToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
}

let cachedToken: PayPalToken | null = null;

/**
 * Get PayPal access token (with caching)
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (cachedToken && cachedToken.expires_at && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal auth failed: ${error}`);
  }

  const data = await response.json() as PayPalToken;
  
  // Cache token with expiry (subtract 60 seconds for safety)
  cachedToken = {
    ...data,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };

  return data.access_token;
}

/**
 * Fetch transactions from PayPal
 */
async function fetchPayPalTransactions(
  startDate: string,
  endDate: string,
  page: number = 1,
  pageSize: number = 100
): Promise<any> {
  const token = await getAccessToken();

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    page_size: pageSize.toString(),
    page: page.toString(),
    fields: 'all',
  });

  const response = await fetch(
    `${PAYPAL_API_BASE}/v1/reporting/transactions?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PayPal API error: ${error}`);
  }

  return response.json();
}

// ============================================
// PayPal Routes
// ============================================

/**
 * Check PayPal connection status
 */
router.get('/status', async (req, res) => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return res.json({ 
        configured: false, 
        message: 'PayPal credentials not configured' 
      });
    }

    // Try to get a token to verify credentials
    await getAccessToken();
    
    res.json({ 
      configured: true, 
      connected: true,
      message: 'PayPal connection active' 
    });
  } catch (error: any) {
    res.json({ 
      configured: true, 
      connected: false, 
      message: error.message 
    });
  }
});

/**
 * Fetch and store PayPal transactions
 */
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.body;

    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return res.status(400).json({ error: 'PayPal not configured' });
    }

    // Default to last 30 days if no dates provided
    const end = endDate || new Date().toISOString();
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get or create PayPal connection
    let connection = db.prepare(`
      SELECT * FROM bank_connections 
      WHERE user_id = ? AND bank_id = 'paypal'
    `).get(userId) as any;

    if (!connection) {
      const connectionId = uuidv4();
      db.prepare(`
        INSERT INTO bank_connections (id, user_id, bank_id, bank_name, bank_url, login_name)
        VALUES (?, ?, 'paypal', 'PayPal', 'https://api.paypal.com', 'paypal')
      `).run(connectionId, userId);
      connection = { id: connectionId };
    }

    // Get or create PayPal account
    let account = db.prepare(`
      SELECT * FROM bank_accounts 
      WHERE connection_id = ? AND account_number = 'paypal'
    `).get(connection.id) as any;

    if (!account) {
      const accountId = uuidv4();
      db.prepare(`
        INSERT INTO bank_accounts (id, connection_id, account_number, account_name, currency)
        VALUES (?, ?, 'paypal', 'PayPal Konto', 'EUR')
      `).run(accountId, connection.id);
      account = { id: accountId };
    }

    // Fetch transactions from PayPal
    let allTransactions: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await fetchPayPalTransactions(start, end, page, 100);
      
      if (result.transaction_details && result.transaction_details.length > 0) {
        allTransactions = allTransactions.concat(result.transaction_details);
        page++;
        
        // Check if there are more pages
        const totalPages = result.total_pages || 1;
        hasMore = page <= totalPages && page <= 10; // Max 10 pages (1000 transactions)
      } else {
        hasMore = false;
      }
    }

    // Store transactions
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions 
      (id, account_id, external_id, date, value_date, amount, currency, 
       counterparty_name, counterparty_iban, description, booking_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    for (const tx of allTransactions) {
      const txInfo = tx.transaction_info || {};
      const payerInfo = tx.payer_info || {};
      
      // Skip certain transaction types (e.g., currency conversions)
      const eventCode = txInfo.transaction_event_code || '';
      if (eventCode.startsWith('T11') || eventCode.startsWith('T12')) {
        continue; // Skip currency conversion events
      }

      const id = uuidv4();
      const externalId = txInfo.transaction_id || `pp_${Date.now()}_${Math.random()}`;
      const date = txInfo.transaction_initiation_date || txInfo.transaction_updated_date;
      const amount = parseFloat(txInfo.transaction_amount?.value || '0');
      const currency = txInfo.transaction_amount?.currency_code || 'EUR';
      
      // Get counterparty name
      let counterpartyName = payerInfo.payer_name?.alternate_full_name 
        || payerInfo.payer_name?.given_name 
        || txInfo.payee_info?.payee_name?.alternate_full_name
        || 'PayPal';
      
      // Get description
      const description = txInfo.transaction_subject 
        || txInfo.transaction_note 
        || eventCode;

      const result = stmt.run(
        id,
        account.id,
        externalId,
        date ? date.split('T')[0] : new Date().toISOString().split('T')[0],
        date ? date.split('T')[0] : new Date().toISOString().split('T')[0],
        amount,
        currency,
        counterpartyName,
        payerInfo.email_address || null,
        description,
        `PayPal: ${eventCode}`
      );

      if (result.changes > 0) {
        added++;
      }
    }

    // Update last sync
    db.prepare(`
      UPDATE bank_connections SET last_sync = datetime('now') WHERE id = ?
    `).run(connection.id);

    // Log sync
    db.prepare(`
      INSERT INTO sync_log (connection_id, status, message, transactions_added)
      VALUES (?, 'success', 'PayPal sync completed', ?)
    `).run(connection.id, added);

    res.json({
      success: true,
      transactionsFound: allTransactions.length,
      transactionsAdded: added,
      period: { start, end },
    });
  } catch (error: any) {
    console.error('PayPal sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get PayPal transactions for a user
 */
router.get('/transactions/:userId', (req, res) => {
  try {
    const { from, to } = req.query;

    let query = `
      SELECT t.*, a.account_number, c.bank_name
      FROM transactions t
      JOIN bank_accounts a ON t.account_id = a.id
      JOIN bank_connections c ON a.connection_id = c.id
      WHERE c.user_id = ? AND c.bank_id = 'paypal'
    `;
    const params: any[] = [req.params.userId];

    if (from) {
      query += ' AND t.date >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND t.date <= ?';
      params.push(to);
    }

    query += ' ORDER BY t.date DESC LIMIT 500';

    const transactions = db.prepare(query).all(...params);
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Disconnect PayPal
 */
router.delete('/disconnect/:userId', (req, res) => {
  try {
    const connection = db.prepare(`
      SELECT id FROM bank_connections WHERE user_id = ? AND bank_id = 'paypal'
    `).get(req.params.userId) as any;

    if (connection) {
      db.prepare('DELETE FROM transactions WHERE account_id IN (SELECT id FROM bank_accounts WHERE connection_id = ?)').run(connection.id);
      db.prepare('DELETE FROM bank_accounts WHERE connection_id = ?').run(connection.id);
      db.prepare('DELETE FROM sync_log WHERE connection_id = ?').run(connection.id);
      db.prepare('DELETE FROM bank_connections WHERE id = ?').run(connection.id);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
