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
  is_demo         INTEGER NOT NULL DEFAULT 0, -- 1 = admin demo/simulation account
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
  -- The 3 toggleable axes (ON/OFF per partner). Loyalty is the historical
  -- product so it defaults ON; booking + vitrine are opt-in (default OFF).
  mod_loyalty      INTEGER NOT NULL DEFAULT 1,
  mod_booking      INTEGER NOT NULL DEFAULT 0,
  mod_vitrine      INTEGER NOT NULL DEFAULT 0,
  -- Vitrine: free-text presentation of the business (shown on the public page).
  description      TEXT,
  -- Booking engine flavour, derived from the trade at signup but overridable:
  -- 'appointment' (coiffeur, esthétique, mécanique…) or 'table' (restaurant).
  booking_mode     TEXT CHECK (booking_mode IN ('appointment', 'table')),
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

-- =====================================================================
-- RESERVATION ENGINE (Phase 1) — services, availability, bookings
-- No payment anywhere: prices are informative only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- SERVICES  (prestations a partner offers — catalogue)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY,
  partner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  category     TEXT,                          -- free classement within the pro's own catalogue
  price_cents  INTEGER,                        -- informative only, never charged; NULL = not shown
  currency     TEXT NOT NULL DEFAULT 'EUR',
  duration_min INTEGER NOT NULL DEFAULT 30,    -- appointment length (ignored in table mode)
  capacity     INTEGER NOT NULL DEFAULT 1,     -- max simultaneous bookings per slot (collective)
  image_url    TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,     -- activation / désactivation
  is_private   INTEGER NOT NULL DEFAULT 0,     -- only reachable via direct link (hidden from list)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_services_partner ON services(partner_id, is_active);

-- ---------------------------------------------------------------------
-- BOOKING_SETTINGS  (one row per partner — engine parameters)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_settings (
  partner_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slot_interval_min INTEGER NOT NULL DEFAULT 15,   -- gap between slot start times
  buffer_min        INTEGER NOT NULL DEFAULT 0,    -- dead time after each booking
  min_notice_min    INTEGER NOT NULL DEFAULT 120,  -- earliest a client may book from now
  max_advance_days  INTEGER NOT NULL DEFAULT 60,   -- furthest ahead a client may book
  max_per_day       INTEGER,                        -- NULL = unlimited bookings/day
  default_capacity  INTEGER NOT NULL DEFAULT 20,    -- covers seated at once (table mode)
  timezone          TEXT NOT NULL DEFAULT 'Europe/Paris',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- ---------------------------------------------------------------------
-- AVAILABILITY_RULES  (recurring weekly opening windows)
-- ---------------------------------------------------------------------
-- weekday: 1=Monday … 7=Sunday (ISO-8601). Minutes are from local midnight
-- in the partner's timezone (e.g. 540 = 09:00, 1080 = 18:00).
CREATE TABLE IF NOT EXISTS availability_rules (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_min  INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min    INTEGER NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_avail_rules_partner ON availability_rules(partner_id, weekday);

-- ---------------------------------------------------------------------
-- AVAILABILITY_EXCEPTIONS  (holidays / special one-off days)
-- ---------------------------------------------------------------------
-- A closed day blocks all bookings; an open exception overrides the weekly
-- window for that date only.
CREATE TABLE IF NOT EXISTS availability_exceptions (
  id         TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,                   -- 'YYYY-MM-DD' (local)
  is_closed  INTEGER NOT NULL DEFAULT 1,
  start_min  INTEGER,                          -- when is_closed=0: special open window
  end_min    INTEGER,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_exc_partner_date
  ON availability_exceptions(partner_id, date);

-- ---------------------------------------------------------------------
-- BOOKINGS  (confirmed reservations — source of truth for conflicts)
-- ---------------------------------------------------------------------
-- client_id is NULL for guest bookings (the public page does not force an
-- account). customer_* always carry the contact details used for the booking.
CREATE TABLE IF NOT EXISTS bookings (
  id            TEXT PRIMARY KEY,
  reference     TEXT NOT NULL,                 -- short human ref, unique
  partner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id    TEXT REFERENCES services(id) ON DELETE SET NULL,
  client_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  party_size    INTEGER NOT NULL DEFAULT 1,    -- covers (table) / seats (collective) / 1 (solo)
  starts_at     INTEGER NOT NULL,              -- unix ms
  ends_at       INTEGER NOT NULL,              -- unix ms
  status        TEXT NOT NULL DEFAULT 'confirmed'
                 CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'no_show')),
  notes         TEXT,                          -- client message / custom answers
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  cancelled_at  INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(reference);
CREATE INDEX IF NOT EXISTS idx_bookings_partner ON bookings(partner_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client  ON bookings(client_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_slot    ON bookings(partner_id, service_id, starts_at);
