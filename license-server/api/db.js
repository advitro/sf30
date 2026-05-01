/**
 * Database Layer — Dual Mode (Lazy Init)
 *
 * - Postgres: @neondatabase/serverless (Vercel / serverless)
 * - SQLite:   better-sqlite3 (local development)
 */

import { neon } from '@neondatabase/serverless';

const IS_POSTGRES = process.env.VERCEL === '1' || process.env.VERCEL_ENV || process.env.POSTGRES_URL || process.env.DATABASE_URL;

let _db = null;
let _initPromise = null;

async function getDb() {
  if (_db) return _db;
  if (_initPromise) return _initPromise;
  _initPromise = initDb();
  _db = await _initPromise;
  return _db;
}

async function initDb() {
  if (IS_POSTGRES) {
    return initPostgres();
  }
  return initSQLite();
}

async function initPostgres() {
  const DATABASE_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('POSTGRES_URL or DATABASE_URL must be set for Postgres mode');
  }

  const sql = neon(DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS licenses (
      id SERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      fingerprint_hash TEXT,
      tier TEXT DEFAULT 'basic',
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      expires_at INTEGER,
      revoked INTEGER DEFAULT 0
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      license_key TEXT REFERENCES licenses(key),
      tier TEXT,
      created_at INTEGER
    )
  `;

  return {
    async createLicense({ key, fingerprintHash, tier, createdAt, expiresAt }) {
      await sql`
        INSERT INTO licenses (key, fingerprint_hash, tier, created_at, expires_at, revoked)
        VALUES (${key}, ${fingerprintHash || null}, ${tier || 'basic'}, ${createdAt}, ${expiresAt}, 0)
      `;
    },
    async getLicense(key) {
      const rows = await sql`SELECT * FROM licenses WHERE key = ${key}`;
      return rows[0] || null;
    },
    async activateLicense(id, { activatedAt, expiresAt, fingerprintHash }) {
      await sql`
        UPDATE licenses SET activated_at = ${activatedAt}, expires_at = ${expiresAt}, fingerprint_hash = ${fingerprintHash || null}
        WHERE id = ${id}
      `;
    },
    async revokeLicense(key) {
      await sql`UPDATE licenses SET revoked = 1 WHERE key = ${key}`;
    },
    async deleteLicense(key) {
      await sql`DELETE FROM licenses WHERE key = ${key}`;
    },
    async listRevoked() {
      return sql`SELECT key FROM licenses WHERE revoked = 1 ORDER BY key`;
    },
    async listAll() {
      return sql`
        SELECT key, fingerprint_hash, tier, created_at, activated_at, expires_at, revoked
        FROM licenses ORDER BY created_at DESC
      `;
    },
    async createCustomer({ email, stripeCustomerId, stripeSubscriptionId, licenseKey, tier, createdAt }) {
      await sql`
        INSERT INTO customers (email, stripe_customer_id, stripe_subscription_id, license_key, tier, created_at)
        VALUES (${email}, ${stripeCustomerId}, ${stripeSubscriptionId}, ${licenseKey}, ${tier}, ${createdAt})
      `;
    },
    async getCustomerByLicense(key) {
      const rows = await sql`SELECT * FROM customers WHERE license_key = ${key}`;
      return rows[0] || null;
    },
  };
}

async function initSQLite() {
  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default;
  } catch (e) {
    throw new Error(
      'better-sqlite3 is required for local development. Install it: npm install better-sqlite3\n' +
        'If you are on Vercel, make sure POSTGRES_URL or DATABASE_URL is set.'
    );
  }

  const { existsSync } = await import('fs');
  const DB_PATH = process.env.DB_PATH || './licenses.db';
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      fingerprint_hash TEXT,
      tier TEXT DEFAULT 'basic',
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      expires_at INTEGER,
      revoked INTEGER DEFAULT 0
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      license_key TEXT REFERENCES licenses(key),
      tier TEXT,
      created_at INTEGER
    )
  `).run();

  const stmts = {
    insert: db.prepare(
      'INSERT INTO licenses (key, fingerprint_hash, tier, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, 0)'
    ),
    findByKey: db.prepare('SELECT * FROM licenses WHERE key = ?'),
    updateActivation: db.prepare('UPDATE licenses SET activated_at = ?, expires_at = ?, fingerprint_hash = ? WHERE id = ?'),
    revoke: db.prepare('UPDATE licenses SET revoked = 1 WHERE key = ?'),
    delete: db.prepare('DELETE FROM licenses WHERE key = ?'),
    listRevoked: db.prepare("SELECT key FROM licenses WHERE revoked = 1 ORDER BY key"),
    listAll: db.prepare(
      'SELECT key, fingerprint_hash, tier, created_at, activated_at, expires_at, revoked FROM licenses ORDER BY created_at DESC'
    ),
    insertCustomer: db.prepare(
      'INSERT INTO customers (email, stripe_customer_id, stripe_subscription_id, license_key, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    findCustomerByLicense: db.prepare('SELECT * FROM customers WHERE license_key = ?'),
  };

  return {
    createLicense: ({ key, fingerprintHash, tier, createdAt, expiresAt }) =>
      stmts.insert.run(key, fingerprintHash || null, tier || 'basic', createdAt, expiresAt),
    getLicense: (key) => stmts.findByKey.get(key) || null,
    activateLicense: (id, { activatedAt, expiresAt, fingerprintHash }) =>
      stmts.updateActivation.run(activatedAt, expiresAt, fingerprintHash || null, id),
    revokeLicense: (key) => stmts.revoke.run(key),
    deleteLicense: (key) => stmts.delete.run(key),
    listRevoked: () => stmts.listRevoked.all(),
    listAll: () => stmts.listAll.all(),
    createCustomer: ({ email, stripeCustomerId, stripeSubscriptionId, licenseKey, tier, createdAt }) =>
      stmts.insertCustomer.run(email, stripeCustomerId, stripeSubscriptionId, licenseKey, tier, createdAt),
    getCustomerByLicense: (key) => stmts.findCustomerByLicense.get(key) || null,
  };
}

// Lazy proxy exports
export async function createLicense(...args) {
  const db = await getDb();
  return db.createLicense(...args);
}
export async function getLicense(...args) {
  const db = await getDb();
  return db.getLicense(...args);
}
export async function activateLicense(...args) {
  const db = await getDb();
  return db.activateLicense(...args);
}
export async function revokeLicense(...args) {
  const db = await getDb();
  return db.revokeLicense(...args);
}
export async function deleteLicense(...args) {
  const db = await getDb();
  return db.deleteLicense(...args);
}
export async function listRevoked(...args) {
  const db = await getDb();
  return db.listRevoked(...args);
}
export async function listAll(...args) {
  const db = await getDb();
  return db.listAll(...args);
}
export async function createCustomer(...args) {
  const db = await getDb();
  return db.createCustomer(...args);
}
export async function getCustomerByLicense(...args) {
  const db = await getDb();
  return db.getCustomerByLicense(...args);
}
