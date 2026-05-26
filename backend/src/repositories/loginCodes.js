const driver = require('../db/driver');
const { hmacCode } = require('../lib/crypto');

/**
 * login_code_lookup repository — O(1) reverse lookup from code → user.
 *
 * The HMAC layer prevents rainbow-table attacks on the lookup column
 * (the secret is server-side only). The actual login code remains
 * scrypt-hashed in `users.login_code_hash`.
 */

module.exports = {
  /**
   * Claim a code for a user. Returns true on success, false on collision.
   * Wraps the dbCtx (transaction context) if provided.
   */
  async tryClaim(code, userId, dbCtx = null) {
    const ctx = dbCtx || driver;
    const hmac = hmacCode(code);
    try {
      await ctx.mutate(`INSERT INTO login_code_lookup (code_hmac, user_id) VALUES (?, ?)`, [
        hmac,
        userId,
      ]);
      return true;
    } catch (err) {
      // SQLite PRIMARY KEY collision or Postgres UNIQUE violation.
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === '23505') {
        return false;
      }
      throw err;
    }
  },

  async findUserIdByCode(code) {
    const row = await driver.queryOne(
      `SELECT user_id AS "userId" FROM login_code_lookup WHERE code_hmac = ?`,
      [hmacCode(code)],
    );
    return row?.userId || null;
  },

  async releaseAllForUser(userId) {
    await driver.mutate(`DELETE FROM login_code_lookup WHERE user_id = ?`, [userId]);
  },
};
