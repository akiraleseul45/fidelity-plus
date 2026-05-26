/**
 * SQLite driver — async-shaped API on top of better-sqlite3 (sync).
 *
 * About transactions:
 *   better-sqlite3's native db.transaction(fn) only supports synchronous
 *   `fn` — any await inside makes COMMIT happen before the await resolves
 *   and atomicity is lost. Since our services use async/await throughout
 *   (so the same code works against pg), we implement transactions with
 *   manual BEGIN / COMMIT / ROLLBACK statements wrapped in a serialised
 *   queue (one transaction at a time, FIFO).
 *
 *   In a single-node deploy this is fine. Concurrency is sequenced at
 *   the JS level; SQLite itself is fully durable thanks to WAL mode.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const logger = require('../lib/logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'app.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

const schemaSQL = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schemaSQL);

logger.info({ dbPath: DB_PATH }, '[db] SQLite ready');

// ---------- Statement cache ----------
const stmtCache = new Map();
function prep(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}

// ---------- Async-shaped CRUD ----------
async function query(sql, params = []) {
  return prep(sql).all(...params);
}
async function queryOne(sql, params = []) {
  return prep(sql).get(...params);
}
async function mutate(sql, params = []) {
  return prep(sql).run(...params);
}

// ---------- Transactions ----------
// Manual BEGIN/COMMIT/ROLLBACK + FIFO queue. The queue guarantees that
// only ONE async transaction runs at a time, so we never interleave
// statements from concurrent transactions into the same connection.
//
// At our scale (single Node process) this is plenty. If we ever need
// real concurrent writes, that's the cue to switch DB_DRIVER=postgres.

// FIFO queue: each transaction waits for the previous to complete, then
// claims the connection. The new "barrier" promise is registered BEFORE
// we await the old one — that way our slot is taken atomically even if
// multiple transactions are kicked off in the same tick.
let txQueue = Promise.resolve();

async function transaction(fn) {
  const previousTail = txQueue;
  let releaseSlot;
  txQueue = new Promise((resolve) => {
    releaseSlot = resolve;
  });
  // Wait for the previous transaction to finish before we start.
  await previousTail;

  // Inside the transaction: same async-shaped API the services use.
  const ctx = {
    query: async (sql, params = []) => prep(sql).all(...params),
    queryOne: async (sql, params = []) => prep(sql).get(...params),
    mutate: async (sql, params = []) => prep(sql).run(...params),
  };

  db.exec('BEGIN');
  try {
    const result = await fn(ctx);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* nothing to roll back */
    }
    throw err;
  } finally {
    releaseSlot();
  }
}

module.exports = {
  query,
  queryOne,
  mutate,
  transaction,
  _raw: db,
};
