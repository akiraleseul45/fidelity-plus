const driver = require('../db/driver');
const { newId } = require('../lib/crypto');

/**
 * Loyalty repository — source of truth for points.
 *
 * Every mutation is journaled in `scans` for audit. The `loyalty` table
 * holds the materialised balance for O(1) reads.
 *
 * Mutations should be wrapped in a driver.transaction() by the caller
 * (typically the loyalty service combines nonce-consume + delta-apply).
 *
 * Driver portability:
 *   `MAX(0, x)` (SQLite) is translated to `GREATEST(0, x)` automatically
 *   by driver-postgres.js → so we can use the same SQL on both engines.
 */

// IMPORTANT: we pass delta TWICE. The INSERT branch clamps it to 0+ so
// the row can't be created with negative points. The UPDATE branch uses
// the RAW delta (second `?`) so redeem operations actually subtract.
// `EXCLUDED.points` would only ever see the clamped value, so we can't
// use it — we bind delta as a second positional parameter instead.
const UPSERT_BALANCE_SQL = `
  INSERT INTO loyalty (client_id, partner_id, points, last_scan_at, created_at, updated_at)
  VALUES (?, ?, MAX(0, ?), ?, ?, ?)
  ON CONFLICT(client_id, partner_id) DO UPDATE SET
    points = MAX(0, loyalty.points + ?),
    last_scan_at = EXCLUDED.last_scan_at,
    updated_at = EXCLUDED.updated_at
`;

module.exports = {
  /**
   * Add or subtract points. delta can be positive (scan) or negative (redeem).
   * IMPORTANT: callers should wrap multiple mutations in driver.transaction.
   *
   * If `dbCtx` is provided (sync object from inside a transaction), use it.
   * Otherwise use the top-level async driver.
   */
  async applyDelta({ clientId, partnerId, delta, kind, nonce = null }, dbCtx = null) {
    const ctx = dbCtx || driver;
    const now = Date.now();
    // params order: client_id, partner_id, delta-for-insert, last_scan, created, updated, delta-for-update
    await ctx.mutate(UPSERT_BALANCE_SQL, [clientId, partnerId, delta, now, now, now, delta]);
    await ctx.mutate(
      `INSERT INTO scans (id, client_id, partner_id, delta, kind, nonce, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), clientId, partnerId, delta, kind, nonce, now],
    );
  },

  async balanceOf(clientId, partnerId) {
    const row = await driver.queryOne(
      `SELECT points FROM loyalty WHERE client_id = ? AND partner_id = ?`,
      [clientId, partnerId],
    );
    return row?.points ?? 0;
  },

  async byClient(clientId) {
    return driver.query(
      `SELECT l.partner_id  AS "partnerId",
              l.points,
              l.last_scan_at AS "lastScanAt",
              p.company_name AS "companyName",
              p.owner_name   AS "ownerName",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type      AS "rewardType",
              p.reward_value     AS "rewardValue"
       FROM loyalty l
       INNER JOIN partner_profiles p ON p.user_id = l.partner_id
       INNER JOIN users u ON u.id = l.partner_id AND u.deleted_at IS NULL
       WHERE l.client_id = ?
       ORDER BY l.last_scan_at DESC`,
      [clientId],
    );
  },

  async byPartner(partnerId) {
    return driver.query(
      `SELECT l.client_id  AS "clientId",
              l.points,
              l.last_scan_at AS "lastScanAt",
              c.pseudonym
       FROM loyalty l
       INNER JOIN client_profiles c ON c.user_id = l.client_id
       INNER JOIN users u ON u.id = l.client_id AND u.deleted_at IS NULL
       WHERE l.partner_id = ?
       ORDER BY l.points DESC, l.last_scan_at DESC`,
      [partnerId],
    );
  },
};
