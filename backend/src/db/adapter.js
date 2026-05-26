/**
 * Database driver abstraction.
 *
 * Two backends are supported:
 *  - SQLite (default, via better-sqlite3) — synchronous, perfect for
 *    single-node deploys and local dev.
 *  - PostgreSQL (DB_DRIVER=postgres) — production, via pg.Pool.
 *
 * The SQLite path exposes the legacy synchronous API used by all
 * repositories. The Postgres path is wired up but NOT plugged into the
 * repositories yet — switching to async requires touching every repo +
 * service. Status: foundation ready, switch is a planned migration.
 *
 * To migrate to Postgres:
 *   1. Provision Postgres (Supabase / Neon / Render Postgres)
 *   2. `DATABASE_URL=postgres://...` in .env (or Render env vars)
 *   3. Run `node src/db/migrate-to-postgres.js` to copy existing SQLite data
 *   4. Run repositories refactor (convert `.run/.get/.all` to `await`)
 *   5. Set `DB_DRIVER=postgres` and redeploy
 */

const DRIVER = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

if (DRIVER === 'postgres') {
  // The Postgres pool is created here. Repositories must be migrated to
  // async/await before this can serve traffic. Until then, throwing keeps
  // the system honest — no half-migrated runtime.
  const { Client } = require('pg');
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DB_DRIVER=postgres requires DATABASE_URL.');
  }
  throw new Error(
    'Postgres driver is wired but repositories are still synchronous. ' +
      'Run the migration plan in src/db/adapter.js header before flipping DB_DRIVER.',
  );
}

// Default: SQLite — re-export the existing synchronous module.
module.exports = require('./index');
