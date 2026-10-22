-- =====================================================================
-- Migration 2026-10-22 — reservation engine (Phase 1) + 3-axis modules
--
-- ADDITIVE and REVERSIBLE. Safe to run on production BEFORE deploying the
-- new backend: it only adds nullable columns and new tables. No data is
-- dropped or rewritten. Idempotent (IF NOT EXISTS everywhere).
--
-- The new TABLES (services, booking_settings, availability_rules,
-- availability_exceptions, bookings) auto-create on boot via the schema
-- runner, so strictly only the partner_profiles COLUMNS below need running
-- manually first — but the table DDL is repeated here so this file alone
-- fully provisions a database if run by hand.
-- =====================================================================

-- 1. The 3 toggleable axes + vitrine text + booking flavour on partners.
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS mod_loyalty  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS mod_booking  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS mod_vitrine  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS booking_mode TEXT;

ALTER TABLE partner_profiles DROP CONSTRAINT IF EXISTS partner_profiles_booking_mode_check;
ALTER TABLE partner_profiles
  ADD CONSTRAINT partner_profiles_booking_mode_check
  CHECK (booking_mode IS NULL OR booking_mode IN ('appointment', 'table'));

-- 2. Reservation tables (same DDL as postgres-schema.sql).
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
