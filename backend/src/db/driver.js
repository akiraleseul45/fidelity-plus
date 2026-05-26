/**
 * Async DB driver — single API that wraps SQLite (default) or Postgres.
 *
 * All repositories use this API. Behaviour invariants:
 *   - All calls return Promises (uniform across drivers)
 *   - Placeholders are `?` everywhere; we translate to `$1 $2 ...` for pg
 *   - `transaction(fn)` is atomic on both drivers
 *   - `?` count must match the params array length
 *
 * SQLite path: wraps better-sqlite3 (synchronous) with Promise.resolve.
 * Postgres path: pg.Pool, real network round-trips.
 *
 * To switch to Postgres in production:
 *   DB_DRIVER=postgres DATABASE_URL=postgres://... node server.js
 */

const DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

if (DRIVER === 'postgres') {
  module.exports = require('./driver-postgres');
} else {
  module.exports = require('./driver-sqlite');
}
