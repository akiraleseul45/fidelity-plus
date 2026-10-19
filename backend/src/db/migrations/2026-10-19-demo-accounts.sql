-- =====================================================================
-- Migration 2026-10-19 (c) — demo/simulation accounts flag
--
-- ADDITIVE. Marks admin demo accounts so they are excluded from the public
-- directory, admin listings and stats. Idempotent.
-- =====================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo INTEGER NOT NULL DEFAULT 0;
