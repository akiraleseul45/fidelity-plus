#!/usr/bin/env node
/**
 * Apply the Postgres schema to the database named by DATABASE_URL.
 * Used by CI before running the Jest suite against a throwaway Postgres
 * service, so tables exist before the first test query (the runtime driver
 * also applies the schema, but idempotently and asynchronously).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const ssl = process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false };
  const client = new Client({ connectionString, ssl });
  await client.connect();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'postgres-schema.sql'), 'utf8');
  await client.query(sql);
  await client.end();
  console.log('✅ Postgres schema applied');
})().catch((err) => {
  console.error('❌ Failed to apply Postgres schema:', err.message);
  process.exit(1);
});
