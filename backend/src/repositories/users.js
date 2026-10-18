const driver = require('../db/driver');
const { hashSecret, newRefreshToken } = require('../lib/crypto');

/**
 * Users repository — async API, driver-agnostic.
 *
 * All queries go through the driver layer so the same code runs on
 * SQLite (dev/single-node) and PostgreSQL (prod, via DB_DRIVER=postgres).
 */

module.exports = {
  async create(input) {
    await driver.mutate(
      `INSERT INTO users (id, role, email, login_code_hash, created_at, consent_given_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.role,
        input.email ?? null,
        input.loginCodeHash,
        Date.now(),
        input.consentGivenAt ?? null,
      ],
    );
  },

  async byId(id) {
    return driver.queryOne(
      `SELECT id, role, email, failed_attempts, locked_until, created_at, deleted_at
       FROM users WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
  },

  async byEmailAndRole(email, role) {
    if (!email) return null;
    return (
      (await driver.queryOne(
        `SELECT id, role, email, login_code_hash, failed_attempts, locked_until
         FROM users WHERE email = ? AND role = ? AND deleted_at IS NULL`,
        [email.toLowerCase(), role],
      )) || null
    );
  },

  async allByRole(role) {
    return driver.query(
      `SELECT id, role, email, login_code_hash, failed_attempts, locked_until
       FROM users WHERE role = ? AND deleted_at IS NULL`,
      [role],
    );
  },

  async loginCodeHashById(id) {
    const row = await driver.queryOne(`SELECT login_code_hash FROM users WHERE id = ?`, [id]);
    return row?.login_code_hash || null;
  },

  async recordFailedAttempt(id, lockoutMs = 15 * 60 * 1000) {
    await driver.mutate(
      `UPDATE users
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN ? ELSE locked_until END
       WHERE id = ?`,
      [Date.now() + lockoutMs, id],
    );
  },

  async clearFailedAttempts(id) {
    await driver.mutate(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`,
      [id],
    );
  },

  async updateLoginCodeHash(id, hash) {
    await driver.mutate(`UPDATE users SET login_code_hash = ? WHERE id = ?`, [hash, id]);
  },

  /**
   * GDPR deletion (audit FP-05). Keeps the loyalty balances and scan journal
   * (pseudonymised by the opaque user id) for fraud-prevention and accounting
   * integrity, but removes or anonymises every piece of personal data:
   *   - users: deleted_at set, email nulled, login code hash replaced by an
   *     unusable random value
   *   - client/partner profiles: identifying fields anonymised
   *   - sessions: deleted (removes stored IP + user-agent)
   *   - login_code_lookup: deleted (the code can no longer resolve to anyone)
   *   - qr_nonces: deleted
   * A suspended partner also drops out of the public directory and listings.
   */
  async remove(id) {
    const now = Date.now();
    const unusableHash = hashSecret(newRefreshToken());
    await driver.transaction(async (ctx) => {
      await ctx.mutate(
        `UPDATE users SET deleted_at = ?, email = NULL, login_code_hash = ? WHERE id = ?`,
        [now, unusableHash, id],
      );
      await ctx.mutate(
        `UPDATE client_profiles SET pseudonym = 'Compte supprimé' WHERE user_id = ?`,
        [id],
      );
      await ctx.mutate(
        `UPDATE partner_profiles
         SET owner_name = 'Compte supprimé', company_name = 'Compte supprimé',
             address = '—', phone_fixed = NULL, phone_mobile = NULL,
             image_url = NULL, status = 'suspended', updated_at = ?
         WHERE user_id = ?`,
        [now, id],
      );
      await ctx.mutate(`DELETE FROM login_code_lookup WHERE user_id = ?`, [id]);
      await ctx.mutate(`DELETE FROM sessions WHERE user_id = ?`, [id]);
      await ctx.mutate(`DELETE FROM qr_nonces WHERE client_id = ?`, [id]);
    });
  },
};
