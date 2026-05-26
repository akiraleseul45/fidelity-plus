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
};
