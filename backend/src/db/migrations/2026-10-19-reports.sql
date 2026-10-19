-- =====================================================================
-- Migration 2026-10-19 (b) — problem reports
--
-- ADDITIVE. Creates the `reports` table used by the "Signaler un problème"
-- button (clients + partners) which feeds the admin console. Idempotent.
-- =====================================================================
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
