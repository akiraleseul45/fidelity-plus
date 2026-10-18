const driver = require('../db/driver');
const { newId, newRefreshToken, hashSecret, verifySecret, REFRESH_TTL_MS } = require('../lib/crypto');

/**
 * Sessions repository — refresh tokens (hashed) for JWT rotation.
 */

module.exports = {
  async issue({ userId, userAgent, ip }) {
    const id = newId();
    const refreshToken = newRefreshToken();
    await driver.mutate(
      `INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        hashSecret(refreshToken),
        userAgent ?? null,
        ip ?? null,
        Date.now(),
        Date.now() + REFRESH_TTL_MS,
      ],
    );
    return { sessionId: id, refreshToken };
  },

  /**
   * Verify a refresh token and atomically revoke the session so it can be
   * rotated exactly once (audit FP-19).
   *
   * Returns one of:
   *   { status: 'ok', userId }       — verified and revoked by this call
   *   { status: 'reused', userId }   — token replayed after revocation → caller
   *                                    should revoke the whole family
   *   { status: 'race', userId }     — lost a benign concurrent rotation
   *   { status: 'invalid' }          — unknown session or wrong token
   *   { status: 'expired', userId }  — past expiry
   */
  async verifyAndRevoke({ sessionId, refreshToken }) {
    const row = await driver.queryOne(
      `SELECT user_id AS "userId", refresh_token_hash AS "hash",
              expires_at AS "expiresAt", revoked_at AS "revokedAt"
       FROM sessions WHERE id = ?`,
      [sessionId],
    );
    if (!row) return { status: 'invalid' };
    if (!verifySecret(refreshToken, row.hash)) return { status: 'invalid' };
    if (Number(row.expiresAt) < Date.now()) return { status: 'expired', userId: row.userId };
    // Token matched a session that was already revoked when we read it → replay.
    if (row.revokedAt) return { status: 'reused', userId: row.userId };
    // Atomic revoke: only the winner of a concurrent race flips the row.
    const res = await driver.mutate(
      `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
      [Date.now(), sessionId],
    );
    if (res.changes !== 1) return { status: 'race', userId: row.userId };
    return { status: 'ok', userId: row.userId };
  },

  async revoke(sessionId) {
    await driver.mutate(`UPDATE sessions SET revoked_at = ? WHERE id = ?`, [
      Date.now(),
      sessionId,
    ]);
  },

  async revokeAllForUser(userId) {
    await driver.mutate(
      `UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
      [Date.now(), userId],
    );
  },

  /** Hard-delete sessions for a user (used on account deletion, audit FP-05). */
  async deleteAllForUser(userId, dbCtx = null) {
    const ctx = dbCtx || driver;
    await ctx.mutate(`DELETE FROM sessions WHERE user_id = ?`, [userId]);
  },

  /**
   * Housekeeping: delete sessions that are expired or have been revoked for
   * more than the retention window (audit FP-05 — sessions accumulated
   * forever). Keeps recently-revoked rows briefly for replay detection.
   */
  async purgeExpired(revokedGraceMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const res = await driver.mutate(
      `DELETE FROM sessions
       WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
      [now, now - revokedGraceMs],
    );
    return res.changes;
  },
};
