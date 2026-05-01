/**
 * Database Layer — Dual Mode (Lazy Init)
 *
 * - Postgres: @neondatabase/serverless (Vercel / serverless)
 * - SQLite:   better-sqlite3 (local development)
 */

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
  let neon;
  try {
    const mod = await import('@neondatabase/serverless');
    neon = mod.neon;
  } catch (e) {
    throw new Error(
      'Postgres driver not found. Install it: npm install @neondatabase/serverless\n' +
        'Or unset POSTGRES_URL / DATABASE_URL to use SQLite locally.'
    );
  }

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
    async activateLicense(id, { activatedAt, expiresAt }) {
      await sql`
        UPDATE licenses SET activated_at = ${activatedAt}, expires_at = ${expiresAt}
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

  const stmts = {
    insert: db.prepare(
      'INSERT INTO licenses (key, fingerprint_hash, tier, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, 0)'
    ),
    findByKey: db.prepare('SELECT * FROM licenses WHERE key = ?'),
    updateActivation: db.prepare('UPDATE licenses SET activated_at = ?, expires_at = ? WHERE id = ?'),
    revoke: db.prepare('UPDATE licenses SET revoked = 1 WHERE key = ?'),
    delete: db.prepare('DELETE FROM licenses WHERE key = ?'),
    listRevoked: db.prepare("SELECT key FROM licenses WHERE revoked = 1 ORDER BY key"),
    listAll: db.prepare(
      'SELECT key, fingerprint_hash, tier, created_at, activated_at, expires_at, revoked FROM licenses ORDER BY created_at DESC'
    ),
  };

  return {
    createLicense: ({ key, fingerprintHash, tier, createdAt, expiresAt }) =>
      stmts.insert.run(key, fingerprintHash || null, tier || 'basic', createdAt, expiresAt),
    getLicense: (key) => stmts.findByKey.get(key) || null,
    activateLicense: (id, { activatedAt, expiresAt }) =>
      stmts.updateActivation.run(activatedAt, expiresAt, id),
    revokeLicense: (key) => stmts.revoke.run(key),
    deleteLicense: (key) => stmts.delete.run(key),
    listRevoked: () => stmts.listRevoked.all(),
    listAll: () => stmts.listAll.all(),
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
