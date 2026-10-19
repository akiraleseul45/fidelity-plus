-- =====================================================================
-- Migration 2026-10-19 — categories, service mode, suspension, admin role
--
-- ADDITIVE and REVERSIBLE. Safe to run on production: it only adds nullable
-- columns and widens two CHECK constraints. No data is dropped or rewritten.
-- Idempotent where Postgres allows (IF NOT EXISTS); the CHECK swaps are
-- guarded so re-running is harmless.
-- =====================================================================

-- 1. Partner business taxonomy (nullable; existing rows stay NULL until set).
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS category     TEXT;
ALTER TABLE partner_profiles ADD COLUMN IF NOT EXISTS service_mode TEXT;

-- service_mode allowed values (drop-then-add so a re-run is clean).
ALTER TABLE partner_profiles DROP CONSTRAINT IF EXISTS partner_profiles_service_mode_check;
ALTER TABLE partner_profiles
  ADD CONSTRAINT partner_profiles_service_mode_check
  CHECK (service_mode IS NULL OR service_mode IN ('sur_place', 'a_domicile', 'les_deux'));

CREATE INDEX IF NOT EXISTS idx_partner_category ON partner_profiles(category);

-- 2. Account suspension (admin deactivation; NULL = active).
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at BIGINT;

-- 3. Allow the 'admin' role. Widen the existing role CHECK.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('client', 'partner', 'admin'));
