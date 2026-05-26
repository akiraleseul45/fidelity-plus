const driver = require('../db/driver');

module.exports = {
  async createProfile(input) {
    await driver.mutate(
      `INSERT INTO partner_profiles (
        user_id, owner_name, company_name, address, lat, lng,
        phone_fixed, phone_mobile, image_url,
        reward_threshold, reward_type, reward_value,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.userId,
        input.ownerName,
        input.companyName,
        input.address,
        input.lat ?? null,
        input.lng ?? null,
        input.phoneFixed ?? null,
        input.phoneMobile ?? null,
        input.imageUrl ?? null,
        input.rewardThreshold ?? 10,
        input.rewardType ?? 'free_meal',
        input.rewardValue ?? null,
        input.status ?? 'pending',
        Date.now(),
        Date.now(),
      ],
    );
  },

  async byId(id) {
    return driver.queryOne(
      `SELECT u.id, u.email, u.created_at,
              p.owner_name AS "ownerName",
              p.company_name AS "companyName",
              p.address, p.lat, p.lng,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile",
              p.image_url AS "imageUrl",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type AS "rewardType",
              p.reward_value AS "rewardValue",
              p.status, p.updated_at AS "updatedAt"
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id],
    );
  },

  async listPublic() {
    return driver.query(
      `SELECT u.id, u.created_at,
              p.owner_name AS "ownerName",
              p.company_name AS "companyName",
              p.address, p.lat, p.lng,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile",
              p.image_url AS "imageUrl",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type AS "rewardType",
              p.reward_value AS "rewardValue",
              p.status
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.deleted_at IS NULL
         AND p.status IN ('approved', 'pending')
       ORDER BY p.created_at DESC`,
    );
  },

  async updateRewardSettings(userId, { rewardThreshold, rewardType, rewardValue }) {
    await driver.mutate(
      `UPDATE partner_profiles
       SET reward_threshold = ?, reward_type = ?, reward_value = ?, updated_at = ?
       WHERE user_id = ?`,
      [rewardThreshold, rewardType, rewardValue ?? null, Date.now(), userId],
    );
  },

  async lastSignupByEmail(email) {
    return driver.queryOne(
      `SELECT u.created_at FROM users u
       WHERE u.email = ? AND u.role = 'partner' AND u.deleted_at IS NULL
       ORDER BY u.created_at DESC LIMIT 1`,
      [email.toLowerCase()],
    );
  },
};
