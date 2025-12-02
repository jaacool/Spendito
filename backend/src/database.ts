import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'spendito.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db: DatabaseType = new Database(dbPath);

// Initialize database schema
db.exec(`
  -- Bank connections table
  CREATE TABLE IF NOT EXISTS bank_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    bank_id TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_url TEXT NOT NULL,
    login_name TEXT NOT NULL,
    encrypted_pin TEXT,
    system_id TEXT,
    banking_info TEXT,
    selected_tan_method TEXT,
    last_sync TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Bank accounts table
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    account_number TEXT NOT NULL,
    iban TEXT,
    bic TEXT,
    account_name TEXT,
    account_type TEXT,
    balance REAL,
    balance_date TEXT,
    currency TEXT DEFAULT 'EUR',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
  );

  -- Transactions table
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    external_id TEXT,
    date TEXT NOT NULL,
    value_date TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    counterparty_name TEXT,
    counterparty_iban TEXT,
    description TEXT,
    booking_text TEXT,
    category TEXT,
    is_manually_categorized INTEGER DEFAULT 0,
    confidence REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES bank_accounts(id),
    UNIQUE(account_id, external_id)
  );

  -- TAN challenges table (for pending TAN requests)
  CREATE TABLE IF NOT EXISTS tan_challenges (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    challenge_type TEXT,
    challenge_text TEXT,
    challenge_media BLOB,
    challenge_data TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
  );

  -- Sync log table
  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    connection_id TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT,
    transactions_added INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (connection_id) REFERENCES bank_connections(id)
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
  CREATE INDEX IF NOT EXISTS idx_bank_accounts_connection ON bank_accounts(connection_id);
`);

export default db;

// Helper functions
export function generateId(): string {
  return require('uuid').v4();
}

export interface BankConnection {
  id: string;
  user_id: string;
  bank_id: string;
  bank_name: string;
  bank_url: string;
  login_name: string;
  encrypted_pin?: string;
  system_id?: string;
  banking_info?: string;
  selected_tan_method?: string;
  last_sync?: string;
}

export interface BankAccount {
  id: string;
  connection_id: string;
  account_number: string;
  iban?: string;
  bic?: string;
  account_name?: string;
  account_type?: string;
  balance?: number;
  balance_date?: string;
  currency: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  external_id?: string;
  date: string;
  value_date?: string;
  amount: number;
  currency: string;
  counterparty_name?: string;
  counterparty_iban?: string;
  description?: string;
  booking_text?: string;
  category?: string;
  is_manually_categorized: boolean;
  confidence?: number;
}
