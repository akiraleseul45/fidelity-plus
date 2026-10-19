-- =====================================================================
-- Fidelity Plus — PostgreSQL schema (production)
--
-- Mirror of `schema.sql` (SQLite) with the few PG-specific tweaks:
--   - BIGINT for millisecond timestamps (SQLite INTEGER is 64-bit too,
--     but explicit BIGINT documents intent)
--   - DOUBLE PRECISION for lat/lng (SQLite REAL is implicitly DP)
--   - "deferrable initially deferred" not used (no need)
--   - WHERE clauses on indexes are supported by PG just like SQLite
--   - ON CONFLICT (...) DO UPDATE syntax is identical (PG 9.5+)
-- =====================================================================

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('client', 'partner', 'admin')),
  email           TEXT,
  login_code_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    BIGINT,
  created_at      BIGINT NOT NULL,
  deleted_at      BIGINT,
  suspended_at    BIGINT,
  consent_given_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

CREATE TABLE IF NOT EXISTS login_code_lookup (
  code_hmac TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lookup_user ON login_code_lookup(user_id);

CREATE TABLE IF NOT EXISTS client_profiles (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pseudonym  TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS partner_profiles (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owner_name       TEXT NOT NULL,
  company_name     TEXT NOT NULL,
  address          TEXT NOT NULL,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  phone_fixed      TEXT,
  phone_mobile     TEXT,
  image_url        TEXT,
  category         TEXT,
  service_mode     TEXT CHECK (service_mode IN ('sur_place', 'a_domicile', 'les_deux')),
  reward_threshold INTEGER NOT NULL DEFAULT 10,
  reward_type      TEXT    NOT NULL DEFAULT 'free_meal' CHECK (reward_type IN ('free_meal', 'discount')),
  reward_value     INTEGER,
  status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_partner_status   ON partner_profiles(status);
CREATE INDEX IF NOT EXISTS idx_partner_category ON partner_profiles(category);

CREATE TABLE IF NOT EXISTS loyalty (
  client_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  last_scan_at BIGINT,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL,
  PRIMARY KEY (client_id, partner_id)
);
CREATE INDEX IF NOT EXISTS idx_loyalty_client  ON loyalty(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_partner ON loyalty(partner_id);

CREATE TABLE IF NOT EXISTS scans (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('add', 'redeem')),
  nonce       TEXT,
  created_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_client     ON scans(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_partner    ON scans(partner_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_nonce_unique
  ON scans(nonce) WHERE nonce IS NOT NULL;

CREATE TABLE IF NOT EXISTS qr_nonces (
  nonce       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at   BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  consumed_at BIGINT,
  consumed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_nonces_client  ON qr_nonces(client_id);
CREATE INDEX IF NOT EXISTS idx_qr_nonces_expires ON qr_nonces(expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent      TEXT,
  ip              TEXT,
  created_at      BIGINT NOT NULL,
  expires_at      BIGINT NOT NULL,
  revoked_at      BIGINT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
