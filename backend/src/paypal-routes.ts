import { Router } from 'express';
import db from './database.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// PayPal API Configuration
const PAYPAL_API_BASE = 'https://api-m.paypal.com'; // Live API
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const BACKEND_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3001';

interface PayPalToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  refresh_token?: string;
}

// Store user tokens in memory (loaded from DB)
const userTokens: Map<string, PayPalToken> = new Map();

/**
 * Exchange authorization code for user access token
 */
async function exchangeCodeForToken(code: string, redirectUri: string): Promise<PayPalToken> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[PayPal] Token exchange error:', error);
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = await response.json() as PayPalToken;
  return {
    ...data,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
}

/**
 * Refresh user access token
 */
async function refreshUserToken(refreshToken: string): Promise<PayPalToken> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }

  const data = await response.json() as PayPalToken;
  return {
    ...data,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
}

/**
 * Get valid user token (refresh if needed)
 */
async function getUserToken(userId: string): Promise<string | null> {
  const token = userTokens.get(userId);
  if (!token) return null;

  // Check if token is expired
  if (token.expires_at && Date.now() >= token.expires_at) {
    if (token.refresh_token) {
      try {
        const newToken = await refreshUserToken(token.refresh_token);
        userTokens.set(userId, newToken);
        
        // Update in database
        db.prepare(`
          UPDATE bank_connections 
          SET banking_info = ? 
          WHERE user_id = ? AND bank_id = 'paypal'
        `).run(JSON.stringify(newToken), userId);
        
        return newToken.access_token;
      } catch (err) {
        console.error('[PayPal] Token refresh failed:', err);
        userTokens.delete(userId);
        return null;
      }
    }
    return null;
  }

  return token.access_token;
}

/**
 * Fetch transactions from PayPal using user's token
 * Handles the 31-day limit by splitting the request into chunks
 */
async function fetchUserTransactions(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allTransactions: any[] = [];

  // PayPal API limit: 31 days per request
  const CHUNK_SIZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days to be safe

  let currentStart = start;
  while (currentStart < end) {
    let currentEnd = new Date(currentStart.getTime() + CHUNK_SIZE_MS);
    if (currentEnd > end) currentEnd = end;

    const formattedStart = currentStart.toISOString().split('.')[0] + 'Z';
    const formattedEnd = currentEnd.toISOString().split('.')[0] + 'Z';

    const params = new URLSearchParams({
      start_date: formattedStart,
      end_date: formattedEnd,
      page_size: '100',
      fields: 'all',
    });

    const apiUrl = `${PAYPAL_API_BASE}/v1/reporting/transactions?${params.toString()}`;
    console.log(`[PayPal] Fetching chunk: ${formattedStart} to ${formattedEnd}`);

    const response = await fetch(
      apiUrl,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`[PayPal] API Error (${response.status}):`, error);
      // If one chunk fails, we might still want the others, but for now throw
      throw new Error(`PayPal API error in chunk ${formattedStart}-${formattedEnd}: ${error}`);
    }

    const data = await response.json() as any;
    const chunkTransactions = data.transaction_details || [];
    allTransactions.push(...chunkTransactions);

    // Next chunk starts where this one ended (add 1 second to avoid duplicates if API is inclusive)
    currentStart = new Date(currentEnd.getTime() + 1000);
  }

  return allTransactions;
}

/**
 * Load user tokens from database on startup
 */
function loadUserTokens() {
  try {
    const connections = db.prepare(`
      SELECT user_id, banking_info FROM bank_connections WHERE bank_id = 'paypal'
    `).all() as any[];

    for (const conn of connections) {
      if (conn.banking_info) {
        try {
          const token = JSON.parse(conn.banking_info);
          userTokens.set(conn.user_id, token);
        } catch {}
      }
    }
    console.log(`[PayPal] Loaded ${userTokens.size} user tokens`);
  } catch (err) {
    console.error('[PayPal] Failed to load tokens:', err);
  }
}

// Load tokens on module init
loadUserTokens();

// ============================================
// PayPal Routes
// ============================================

/**
 * Get PayPal OAuth login URL
 */
router.get('/auth-url/:userId', (req, res) => {
  if (!PAYPAL_CLIENT_ID) {
    return res.status(400).json({ error: 'PayPal nicht konfiguriert' });
  }

  const { userId } = req.params;
  const redirectUri = `${BACKEND_URL}/api/paypal/callback`;
  
  // PayPal OAuth URL - request reporting scope
  const scopes = [
    'openid',
    'email',
    'https://uri.paypal.com/services/reporting/search/read'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: PAYPAL_CLIENT_ID,
    response_type: 'code',
    scope: scopes,
    redirect_uri: redirectUri,
    state: userId, // Pass userId in state to identify user after callback
  });

  const authUrl = `https://www.paypal.com/signin/authorize?${params.toString()}`;
  
  res.json({ authUrl, redirectUri });
});

/**
 * PayPal OAuth callback - exchange code for token
 */
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) {
    return res.status(400).send('Fehlende Parameter');
  }

  try {
    const redirectUri = `${BACKEND_URL}/api/paypal/callback`;
    const token = await exchangeCodeForToken(code as string, redirectUri);
    
    // Store token in memory
    userTokens.set(userId as string, token);

    // Store/update connection in database
    const existingConnection = db.prepare(`
      SELECT id FROM bank_connections WHERE user_id = ? AND bank_id = 'paypal'
    `).get(userId) as any;

    if (existingConnection) {
      db.prepare(`
        UPDATE bank_connections 
        SET banking_info = ?, last_sync = datetime('now')
        WHERE id = ?
      `).run(JSON.stringify(token), existingConnection.id);
    } else {
      const connectionId = uuidv4();
      db.prepare(`
        INSERT INTO bank_connections (id, user_id, bank_id, bank_name, bank_url, login_name, banking_info)
        VALUES (?, ?, 'paypal', 'PayPal', 'https://api.paypal.com', 'oauth', ?)
      `).run(connectionId, userId, JSON.stringify(token));
    }

    // Redirect to success page or deep link back to app
    res.send(`
      <html>
        <head>
          <title>PayPal verbunden</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px 20px; color: #1f2937;">
          <div style="max-width: 400px; margin: 0 auto;">
            <div style="font-size: 64px; margin-bottom: 20px;">✅</div>
            <h1 style="font-size: 24px; margin-bottom: 16px;">PayPal erfolgreich verbunden!</h1>
            <p style="font-size: 16px; color: #6b7280; line-height: 1.5; margin-bottom: 30px;">
              Du kannst dieses Fenster nun schließen und zur App zurückkehren.
            </p>
            <button onclick="window.close()" 
               style="display: block; width: 100%; background: #0070ba; color: white; border: none; padding: 14px 24px; border-radius: 8px; font-weight: 600; font-size: 16px; cursor: pointer; margin-bottom: 12px;">
              Fenster schließen
            </button>
            <a href="spendito://paypal-success" id="app-link" style="display: none; font-size: 14px; color: #0070ba;">Zurück zur App (Mobile)</a>
          </div>
          <script>
            // For Web/Vercel: Try to notify the opener window
            if (window.opener) {
              window.opener.postMessage({ type: 'PAYPAL_CONNECTED' }, '*');
            }
            
            // For Mobile: Try deep links
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
              document.getElementById('app-link').style.display = 'block';
              setTimeout(() => {
                window.location.href = 'spendito://paypal-success';
              }, 1000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('[PayPal] Callback error:', error);
    res.status(500).send(`
      <html>
        <head><title>Fehler</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>❌ Verbindung fehlgeschlagen</h1>
          <p>${error.message}</p>
          <p>Bitte versuche es erneut.</p>
        </body>
      </html>
    `);
  }
});

/**
 * Check PayPal connection status for a user
 */
router.get('/status/:userId', async (req, res) => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return res.json({ 
        configured: false, 
        connected: false,
        message: 'PayPal API nicht konfiguriert' 
      });
    }

    const { userId } = req.params;
    
    // Check if user has a valid token
    const token = await getUserToken(userId);
    const connection = db.prepare(`
      SELECT * FROM bank_connections 
      WHERE user_id = ? AND bank_id = 'paypal'
    `).get(userId) as any;
    
    res.json({ 
      configured: true, 
      connected: !!token,
      lastSync: connection?.last_sync || null,
      message: token ? 'PayPal verbunden' : 'Nicht verbunden'
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
 * Sync PayPal transactions for a user
 */
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.body;

    // Get user's access token
    const accessToken = await getUserToken(userId);
    if (!accessToken) {
      return res.status(401).json({ 
        error: 'PayPal nicht verbunden. Bitte zuerst anmelden.',
        needsAuth: true 
      });
    }

    // Default to last 3 years (PayPal API max is 3 years)
    const end = endDate || new Date().toISOString();
    // PayPal API requires YYYY-MM-DDTHH:mm:ssZ format
    const start = startDate || new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z';
    const endFormatted = end.split('.')[0] + 'Z';

    console.log(`[PayPal] Original Start: ${new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString()}`);
    console.log(`[PayPal] Formatted Start: ${start}`);
    console.log(`[PayPal] Formatted End: ${endFormatted}`);

    // Get connection
    const connection = db.prepare(`
      SELECT * FROM bank_connections WHERE user_id = ? AND bank_id = 'paypal'
    `).get(userId) as any;

    if (!connection) {
      return res.status(400).json({ error: 'Keine PayPal-Verbindung gefunden' });
    }

    // Get or create account
    let account = db.prepare(`
      SELECT * FROM bank_accounts WHERE connection_id = ? AND account_number = 'paypal'
    `).get(connection.id) as any;

    if (!account) {
      const accountId = uuidv4();
      db.prepare(`
        INSERT INTO bank_accounts (id, connection_id, account_number, account_name, currency)
        VALUES (?, ?, 'paypal', 'PayPal Konto', 'EUR')
      `).run(accountId, connection.id);
      account = { id: accountId };
    }

    // Fetch transactions
    console.log(`[PayPal] Fetching transactions for user ${userId} from ${start} to ${endFormatted}`);
    const transactions = await fetchUserTransactions(accessToken, start, endFormatted);
    console.log(`[PayPal] Found ${transactions.length} total transactions`);
    
    // Log the structure of the first transaction to debug
    if (transactions.length > 0) {
      console.log('[PayPal] First transaction sample:', JSON.stringify(transactions[0], null, 2));
    } else {
      console.log('[PayPal] No transactions found in the specified time range.');
    }

    // Store transactions
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions 
      (id, account_id, external_id, date, value_date, amount, currency, 
       counterparty_name, counterparty_iban, description, booking_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    for (const tx of transactions) {
      const txInfo = tx.transaction_info || {};
      const payerInfo = tx.payer_info || {};
      
      const eventCode = txInfo.transaction_event_code || '';
      console.log(`[PayPal] Processing TX: ${txInfo.transaction_id}, Code: ${eventCode}, Amount: ${txInfo.transaction_amount?.value}`);

      if (eventCode.startsWith('T11') || eventCode.startsWith('T12')) {
        console.log(`[PayPal] Skipping currency conversion TX: ${txInfo.transaction_id}`);
        continue; // Skip currency conversions
      }

      const id = uuidv4();
      const externalId = txInfo.transaction_id || `pp_${Date.now()}_${Math.random()}`;
      const date = txInfo.transaction_initiation_date || txInfo.transaction_updated_date;
      const amount = parseFloat(txInfo.transaction_amount?.value || '0');
      const currency = txInfo.transaction_amount?.currency_code || 'EUR';
      
      const counterpartyName = payerInfo.payer_name?.alternate_full_name 
        || payerInfo.payer_name?.given_name 
        || txInfo.payee_info?.payee_name?.alternate_full_name
        || 'PayPal';
      
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

      if (result.changes > 0) added++;
    }

    // Update last sync
    db.prepare(`
      UPDATE bank_connections SET last_sync = datetime('now') WHERE id = ?
    `).run(connection.id);

    res.json({
      success: true,
      transactionsFound: transactions.length,
      transactionsAdded: added,
    });
  } catch (error: any) {
    console.error('[PayPal] Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Disconnect PayPal
 */
router.delete('/disconnect/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    // Remove from memory
    userTokens.delete(userId);

    // Remove from database
    const connection = db.prepare(`
      SELECT id FROM bank_connections WHERE user_id = ? AND bank_id = 'paypal'
    `).get(userId) as any;

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
