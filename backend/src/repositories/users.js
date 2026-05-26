const driver = require('../db/driver');

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

  /** GDPR soft-delete: keeps the row for audit but wipes personal data. */
  async remove(id) {
    await driver.mutate(`UPDATE users SET deleted_at = ?, email = NULL WHERE id = ?`, [
      Date.now(),
      id,
    ]);
  },
};
