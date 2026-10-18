/**
 * PostgreSQL driver — exposes the same async API as driver-sqlite.
 *
 * Differences SQLite → Postgres handled transparently here:
 *   - Placeholders `?` → `$1, $2, ...`
 *   - `MAX(0, x)`     → `GREATEST(0, x)`
 *   - `MIN(0, x)`     → `LEAST(0, x)`
 *   - Result shape unified: { changes, lastInsertRowid } for mutate()
 *     (lastInsertRowid is always null for pg — repositories that need
 *     the inserted ID should use INSERT ... RETURNING id directly)
 *
 * Transactions: BEGIN/COMMIT/ROLLBACK on a checked-out client so all
 * statements in the txn share the same connection (essential).
 *
 * Provisioned via DATABASE_URL=postgres://user:pass@host:5432/db
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const logger = require('../lib/logger');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DB_DRIVER=postgres requires DATABASE_URL.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Most managed Postgres providers (Render, Supabase, Neon) require TLS.
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  max: parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// A pooler (Supabase/Render) drops idle connections. Without this handler,
// node-postgres re-emits that as an uncaught 'error' on the pool and the
// process exits (audit FP-14). Log it and let the pool replace the client.
pool.on('error', (err) => {
  logger.error({ err }, '[db] idle pg client error (connection will be replaced)');
});

// Initial schema run (idempotent — CREATE TABLE IF NOT EXISTS).
(async () => {
  const schemaPath = path.join(__dirname, 'postgres-schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  try {
    await pool.query(sql);
    logger.info('[db] PostgreSQL ready');
  } catch (err) {
    logger.fatal({ err }, '[db] failed to run schema');
    process.exit(1);
  }
})();

/**
 * Translate SQLite-flavoured SQL to Postgres dialect.
 * - `?` placeholders → `$1 $2 ...`
 * - `MAX(0, expr)`   → `GREATEST(0, expr)` (Postgres has no 2-arg MAX)
 */
function translate(sql) {
  let i = 0;
  const translated = sql
    .replace(/\bMAX\s*\(\s*0\s*,/gi, 'GREATEST(0,')
    .replace(/\bMIN\s*\(\s*0\s*,/gi, 'LEAST(0,')
    .replace(/\?/g, () => `$${++i}`);
  return translated;
}

async function query(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return result.rows;
}

async function queryOne(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return result.rows[0];
}

async function mutate(sql, params = []) {
  const result = await pool.query(translate(sql), params);
  return {
    changes: result.rowCount,
    lastInsertRowid: null,
  };
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const boundDriver = {
      query: async (sql, params = []) => (await client.query(translate(sql), params)).rows,
      queryOne: async (sql, params = []) => (await client.query(translate(sql), params)).rows[0],
      mutate: async (sql, params = []) => {
        const r = await client.query(translate(sql), params);
        return { changes: r.rowCount, lastInsertRowid: null };
      },
    };
    const result = await fn(boundDriver);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  queryOne,
  mutate,
  transaction,
  _raw: pool,
};
