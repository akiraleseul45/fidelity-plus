const driver = require('../db/driver');

module.exports = {
  async createProfile(userId, pseudonym) {
    await driver.mutate(
      `INSERT INTO client_profiles (user_id, pseudonym, created_at) VALUES (?, ?, ?)`,
      [userId, pseudonym.trim(), Date.now()],
    );
  },

  async full(id) {
    return driver.queryOne(
      `SELECT u.id, u.email, u.created_at, p.pseudonym
       FROM users u
       INNER JOIN client_profiles p ON p.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id],
    );
  },

  // Admin edit of a client: pseudonym (profile) and/or email (users).
  // Only touches rows whose role is 'client'. Returns true if the account
  // exists and is a (non-deleted) client.
  async adminUpdate(id, { pseudonym, email } = {}) {
    const user = await driver.queryOne(
      `SELECT id FROM users WHERE id = ? AND role = 'client' AND deleted_at IS NULL`,
      [id],
    );
    if (!user) return false;
    if (pseudonym !== undefined) {
      await driver.mutate(`UPDATE client_profiles SET pseudonym = ? WHERE user_id = ?`, [
        pseudonym.trim(),
        id,
      ]);
    }
    if (email !== undefined) {
      await driver.mutate(`UPDATE users SET email = ? WHERE id = ?`, [
        email ? email.trim().toLowerCase() : null,
        id,
      ]);
    }
    return true;
  },
};
