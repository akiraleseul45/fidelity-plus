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

  /** Returns userId on success, null on failure. */
  async verifyRefreshToken({ sessionId, refreshToken }) {
    const row = await driver.queryOne(
      `SELECT id, user_id AS "userId", refresh_token_hash AS "refreshTokenHash", expires_at AS "expiresAt"
       FROM sessions WHERE id = ? AND revoked_at IS NULL AND expires_at >= ?`,
      [sessionId, Date.now()],
    );
    if (!row) return null;
    if (!verifySecret(refreshToken, row.refreshTokenHash)) return null;
    return row.userId;
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
};
