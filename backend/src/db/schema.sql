-- =====================================================================
-- Fidelity Plus — relational schema
--
-- Compatible SQLite (dev/free tier) AND PostgreSQL (prod) without changes
-- except for `INTEGER PRIMARY KEY` (auto-increment SQLite) which becomes
-- `SERIAL PRIMARY KEY` in Postgres. We avoid both by using TEXT UUIDs.
-- =====================================================================

-- Application metadata (used for migration versioning later).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- USERS  (every authenticated entity — clients AND partners)
-- ---------------------------------------------------------------------
-- A user is either a `client` (end customer with a QR) or a `partner`
-- (the pro owner of an establishment). The role determines which data
-- is joined (client vs. partner profile).
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,           -- UUID
  role            TEXT NOT NULL CHECK (role IN ('client', 'partner', 'admin')),
  email           TEXT,                       -- nullable for clients without email
  -- Login secret: 5/8 chars client, 8 chars partner, 12 chars admin. Stored
  -- hashed (scrypt) to mitigate database leaks. Never compare in clear.
  login_code_hash TEXT NOT NULL,
  -- Track failed login attempts to rate-limit per-account.
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER,                    -- unix ms timestamp, NULL if unlocked
  created_at      INTEGER NOT NULL,
  deleted_at      INTEGER,                    -- GDPR soft-delete; row kept for audit
  suspended_at    INTEGER,                    -- admin deactivation; NULL = active
  consent_given_at INTEGER                    -- GDPR explicit consent timestamp
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- ---------------------------------------------------------------------
-- LOGIN_CODE_LOOKUP
-- ---------------------------------------------------------------------
-- O(1) reverse-lookup from login code → user.
--
-- We can't query "WHERE login_code_hash matches code" because scrypt is
-- one-way. Naively, we'd scan all users on every login (impossible at
-- scale + timing attack). Solution: store HMAC(code, server_secret) in a
-- separate indexed table. HMAC is keyed and not vulnerable to rainbow
-- tables; the actual login_code_hash in `users` stays scrypt-protected.
--
-- Login flow becomes:
--   1. lookup user_id WHERE code_hmac = HMAC(input)  — O(1) indexed
--   2. verify scrypt(input, users.login_code_hash)   — one call total
--
-- Signup also uses this table to enforce uniqueness (PRIMARY KEY).
CREATE TABLE IF NOT EXISTS login_code_lookup (
  code_hmac TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lookup_user ON login_code_lookup(user_id);

-- ---------------------------------------------------------------------
-- CLIENT_PROFILES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_profiles (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  pseudonym  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------
-- PARTNER_PROFILES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_profiles (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owner_name       TEXT NOT NULL,
  company_name     TEXT NOT NULL,
  address          TEXT NOT NULL,
  lat              REAL,
  lng              REAL,
  phone_fixed      TEXT,
  phone_mobile     TEXT,
  image_url        TEXT,
  -- Business domain (restaurant, coiffeur, mecanique, …) and how the pro
  -- serves customers (on-site / at-home / both). Used for client-side filters.
  category         TEXT,
  service_mode     TEXT CHECK (service_mode IN ('sur_place', 'a_domicile', 'les_deux')),
  reward_threshold INTEGER NOT NULL DEFAULT 10,
  reward_type      TEXT    NOT NULL DEFAULT 'free_meal' CHECK (reward_type IN ('free_meal', 'discount')),
  reward_value     INTEGER,                   -- percent for discount
  status           TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_status   ON partner_profiles(status);
CREATE INDEX IF NOT EXISTS idx_partner_category ON partner_profiles(category);

-- ---------------------------------------------------------------------
-- LOYALTY  (the actual points balance — server source of truth)
-- ---------------------------------------------------------------------
-- One row per (client, partner) pair. Single counter — points balance.
CREATE TABLE IF NOT EXISTS loyalty (
  client_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  last_scan_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (client_id, partner_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_client  ON loyalty(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_partner ON loyalty(partner_id);

-- ---------------------------------------------------------------------
-- SCANS  (immutable audit log of every point operation)
-- ---------------------------------------------------------------------
-- This is the journal. `loyalty` is a materialised view of these scans.
-- Every add/redeem is appended here so we can audit fraud or rollback.
CREATE TABLE IF NOT EXISTS scans (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,               -- +1 for scan, -threshold for redeem
  kind        TEXT NOT NULL CHECK (kind IN ('add', 'redeem')),
  nonce       TEXT,                           -- the QR nonce used (prevents replay)
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_client     ON scans(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_partner    ON scans(partner_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scans_nonce_unique
  ON scans(nonce) WHERE nonce IS NOT NULL;    -- anti-replay enforcement

-- ---------------------------------------------------------------------
-- QR_NONCES  (live signed QR tokens — used for one-shot anti-replay)
-- ---------------------------------------------------------------------
-- Issued when a client requests a fresh QR. Marked as consumed when a
-- partner scans it. Expires after `expires_at` no matter what.
CREATE TABLE IF NOT EXISTS qr_nonces (
  nonce       TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER,                        -- non-null = already used
  consumed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_qr_nonces_client  ON qr_nonces(client_id);
CREATE INDEX IF NOT EXISTS idx_qr_nonces_expires ON qr_nonces(expires_at);

-- ---------------------------------------------------------------------
-- SESSIONS  (refresh tokens — for JWT rotation)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,           -- bcrypt of the refresh token
  user_agent      TEXT,
  ip              TEXT,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL,
  revoked_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ---------------------------------------------------------------------
-- REPORTS  (problem reports sent by clients / partners to the admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL, -- reporter (nullable)
  role        TEXT,                        -- 'client' | 'partner' at send time
  message     TEXT NOT NULL,
  context     TEXT,                        -- optional screen/context label
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
