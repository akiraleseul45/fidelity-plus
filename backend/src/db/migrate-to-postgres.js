#!/usr/bin/env node
/**
 * One-shot migration: SQLite → PostgreSQL.
 *
 * Usage:
 *   DATABASE_URL=postgres://user:pass@host:5432/db \
 *     SQLITE_PATH=./data/app.sqlite \
 *     node src/db/migrate-to-postgres.js
 *
 * What it does:
 *   1. Connects to Postgres, runs postgres-schema.sql (idempotent)
 *   2. Reads every row from SQLite tables in dependency order
 *   3. Inserts into Postgres with the same IDs (ON CONFLICT DO NOTHING)
 *   4. Wraps everything in a single transaction — atomic
 *
 * Run twice → idempotent (ON CONFLICT). Safe to retry.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { Client } = require('pg');

const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data', 'app.sqlite');
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('❌ DATABASE_URL missing. Set it to your Postgres connection string.');
  process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`❌ SQLite file not found at ${SQLITE_PATH}`);
  process.exit(1);
}

// Tables in dependency order (parents first).
const TABLES = [
  'users',
  'login_code_lookup',
  'client_profiles',
  'partner_profiles',
  'loyalty',
  'scans',
  'qr_nonces',
  'sessions',
  'meta',
];

async function main() {
  console.log(`→ Reading SQLite from ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  console.log(`→ Connecting to Postgres ${PG_URL.replace(/:[^:@]+@/, ':***@')}`);
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();

  console.log('→ Running PG schema');
  const schemaSql = fs.readFileSync(path.join(__dirname, 'postgres-schema.sql'), 'utf8');
  await pg.query(schemaSql);

  await pg.query('BEGIN');
  try {
    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (rows.length === 0) {
        console.log(`  ${table}: empty`);
        continue;
      }
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const sql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const row of rows) {
        await pg.query(sql, cols.map((c) => row[c]));
      }
      console.log(`  ${table}: ${rows.length} rows`);
    }
    await pg.query('COMMIT');
    console.log('✅ Migration complete');
  } catch (err) {
    await pg.query('ROLLBACK');
    console.error('❌ Migration failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main();
