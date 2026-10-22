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
  is_demo         INTEGER NOT NULL DEFAULT 0,
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
  mod_loyalty      INTEGER NOT NULL DEFAULT 1,
  mod_booking      INTEGER NOT NULL DEFAULT 0,
  mod_vitrine      INTEGER NOT NULL DEFAULT 0,
  description      TEXT,
  booking_mode     TEXT CHECK (booking_mode IN ('appointment', 'table')),
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

CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  role        TEXT,
  message     TEXT NOT NULL,
  context     TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at  BIGINT NOT NULL,
  resolved_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);

-- =====================================================================
-- RESERVATION ENGINE (Phase 1). No payment: prices are informative only.
-- =====================================================================

CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  partner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  category     TEXT,
  price_cents  INTEGER,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  duration_min INTEGER NOT NULL DEFAULT 30,
  capacity     INTEGER NOT NULL DEFAULT 1,
  image_url    TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  is_private   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   BIGINT NOT NULL,
  updated_at   BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_partner ON services(partner_id, is_active);

CREATE TABLE IF NOT EXISTS booking_settings (
  partner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slot_interval_min INTEGER NOT NULL DEFAULT 15,
  buffer_min        INTEGER NOT NULL DEFAULT 0,
  min_notice_min    INTEGER NOT NULL DEFAULT 120,
  max_advance_days  INTEGER NOT NULL DEFAULT 60,
  max_per_day       INTEGER,
  default_capacity  INTEGER NOT NULL DEFAULT 1,
  timezone          TEXT NOT NULL DEFAULT 'Europe/Paris',
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_min  INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min    INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avail_rules_partner ON availability_rules(partner_id, weekday);

CREATE TABLE IF NOT EXISTS availability_exceptions (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  is_closed  INTEGER NOT NULL DEFAULT 1,
  start_min  INTEGER,
  end_min    INTEGER,
  reason     TEXT,
  created_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_exc_partner_date
  ON availability_exceptions(partner_id, date);

CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL,
  partner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id    TEXT REFERENCES services(id) ON DELETE SET NULL,
  client_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  party_size    INTEGER NOT NULL DEFAULT 1,
  starts_at     BIGINT NOT NULL,
  ends_at       BIGINT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'no_show')),
  notes         TEXT,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL,
  cancelled_at  BIGINT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);
CREATE INDEX IF NOT EXISTS idx_bookings_partner ON bookings(partner_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client  ON bookings(client_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_slot    ON bookings(partner_id, service_id, starts_at);
