/**
 * Database access layer.
 *
 * We use better-sqlite3 (synchronous, in-process, very fast) as default.
 * In production on a paid Render plan or any host with persistent disk,
 * we can swap to a hosted PostgreSQL by replacing this file with a `pg`
 * Pool wrapper — all repository code uses prepared statements so the
 * SQL stays identical.
 *
 * Why synchronous SQLite over async drivers:
 *  - Node single-threaded model: SQLite is in-process and faster than
 *    any RTT to a remote DB for sub-ms reads.
 *  - Less concurrency bugs (no transaction interleaving) at our scale.
 *  - Trivial backup: just copy the file.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../lib/logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'app.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Ensure parent directory exists (e.g. `backend/data/`).
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Pragmas for performance + safety.
db.pragma('journal_mode = WAL');     // concurrent reads while writing
db.pragma('foreign_keys = ON');      // enforce FK constraints
db.pragma('synchronous = NORMAL');   // good perf, still crash-safe
db.pragma('busy_timeout = 5000');    // wait 5s on writer locks

// Run schema (idempotent — uses IF NOT EXISTS everywhere).
const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schemaSQL);

logger.info({ dbPath: DB_PATH }, '[db] SQLite ready');

/**
 * Wrap a function in a synchronous transaction. Rolls back on throw.
 * Usage:
 *   const result = withTx(() => {
 *     repo.insertA(...);
 *     repo.insertB(...);
 *   });
 */
function withTx(fn) {
  const tx = db.transaction(fn);
  return tx();
}

module.exports = { db, withTx };
