import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import db from './database.js';
import { v4 as uuidv4 } from 'uuid';
import fintsRoutes from './fints-routes.js';
import paypalRoutes from './paypal-routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// FinTS routes
app.use('/api/fints', fintsRoutes);

// PayPal routes
app.use('/api/paypal', paypalRoutes);

// ============================================
// Bank Connection Endpoints
// ============================================

// Get all connections for a user
app.get('/api/connections/:userId', (req, res) => {
  try {
    const connections = db.prepare(`
      SELECT id, user_id, bank_id, bank_name, last_sync, created_at
      FROM bank_connections WHERE user_id = ?
    `).all(req.params.userId);
    res.json(connections);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new bank connection (initiate FinTS)
app.post('/api/connections', async (req, res) => {
  const { userId, bankId, bankUrl, bankName, loginName, pin } = req.body;

  if (!userId || !bankId || !loginName || !pin) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // For now, store connection info - FinTS will be handled separately
    const connectionId = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO bank_connections (id, user_id, bank_id, bank_name, bank_url, login_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(connectionId, userId, bankId, bankName || 'Volksbank', bankUrl || 'https://hbci11.fiducia.de/cgi-bin/hbciservlet', loginName);

    res.json({ 
      connectionId,
      message: 'Connection created. Use /api/sync to fetch transactions.',
      nextStep: 'sync'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a connection
app.delete('/api/connections/:connectionId', (req, res) => {
  try {
    // Delete related data first
    db.prepare('DELETE FROM transactions WHERE account_id IN (SELECT id FROM bank_accounts WHERE connection_id = ?)').run(req.params.connectionId);
    db.prepare('DELETE FROM bank_accounts WHERE connection_id = ?').run(req.params.connectionId);
    db.prepare('DELETE FROM tan_challenges WHERE connection_id = ?').run(req.params.connectionId);
    db.prepare('DELETE FROM sync_log WHERE connection_id = ?').run(req.params.connectionId);
    db.prepare('DELETE FROM bank_connections WHERE id = ?').run(req.params.connectionId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Account Endpoints
// ============================================

// Get accounts for a connection
app.get('/api/accounts/:connectionId', (req, res) => {
  try {
    const accounts = db.prepare(`
      SELECT * FROM bank_accounts WHERE connection_id = ?
    `).all(req.params.connectionId);
    res.json(accounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Transaction Endpoints
// ============================================

// Get all transactions for a user
app.get('/api/transactions/:userId', (req, res) => {
  try {
    const { from, to, account } = req.query;
    
    let query = `
      SELECT t.*, a.account_number, a.iban, c.bank_name, c.bank_id
      FROM transactions t
      JOIN bank_accounts a ON t.account_id = a.id
      JOIN bank_connections c ON a.connection_id = c.id
      WHERE c.user_id = ?
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
    if (account) {
      query += ' AND t.account_id = ?';
      params.push(account);
    }

    query += ' ORDER BY t.date DESC LIMIT 1000';

    const transactions = db.prepare(query).all(...params);
    res.json(transactions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update transaction category
app.patch('/api/transactions/:transactionId', (req, res) => {
  try {
    const { category, isManuallyCategized } = req.body;
    
    db.prepare(`
      UPDATE transactions 
      SET category = ?, is_manually_categorized = ?
      WHERE id = ?
    `).run(category, isManuallyCategized ? 1 : 0, req.params.transactionId);
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Sync Endpoints (Manual for now)
// ============================================

// Import transactions manually (CSV-like format)
app.post('/api/import/:connectionId', (req, res) => {
  try {
    const { accountNumber, transactions } = req.body;
    const connectionId = req.params.connectionId;

    // Get or create account
    let account = db.prepare(`
      SELECT * FROM bank_accounts WHERE connection_id = ? AND account_number = ?
    `).get(connectionId, accountNumber) as any;

    if (!account) {
      const accountId = uuidv4();
      db.prepare(`
        INSERT INTO bank_accounts (id, connection_id, account_number, currency)
        VALUES (?, ?, ?, 'EUR')
      `).run(accountId, connectionId, accountNumber);
      account = { id: accountId };
    }

    // Import transactions
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO transactions 
      (id, account_id, external_id, date, value_date, amount, currency, 
       counterparty_name, counterparty_iban, description, booking_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    for (const tx of transactions) {
      const id = uuidv4();
      const externalId = tx.externalId || `${tx.date}_${tx.amount}_${tx.counterpartyName || ''}`;
      
      const result = stmt.run(
        id,
        account.id,
        externalId,
        tx.date,
        tx.valueDate || tx.date,
        tx.amount,
        tx.currency || 'EUR',
        tx.counterpartyName,
        tx.counterpartyIban,
        tx.description,
        tx.bookingText
      );

      if (result.changes > 0) {
        added++;
      }
    }

    // Log import
    db.prepare(`
      INSERT INTO sync_log (connection_id, status, message, transactions_added)
      VALUES (?, 'success', 'Manual import', ?)
    `).run(connectionId, added);

    res.json({ success: true, transactionsAdded: added });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get sync history
app.get('/api/sync-log/:connectionId', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM sync_log WHERE connection_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.params.connectionId);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Stats Endpoints
// ============================================

app.get('/api/stats/:userId', (req, res) => {
  try {
    const { year } = req.query;
    const yearFilter = year ? `AND strftime('%Y', t.date) = '${year}'` : '';

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total_income,
        SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as total_expenses,
        MIN(t.date) as first_transaction,
        MAX(t.date) as last_transaction
      FROM transactions t
      JOIN bank_accounts a ON t.account_id = a.id
      JOIN bank_connections c ON a.connection_id = c.id
      WHERE c.user_id = ? ${yearFilter}
    `).get(req.params.userId);

    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`🚀 Spendito Backend running on http://localhost:${PORT}`);
  console.log(`📊 Database: ${process.env.DATABASE_PATH || 'data/spendito.db'}`);
});

export default app;
