const driver = require('../db/driver');

// Whitelist of editable partner columns: jsField -> db column. Used by both
// partner self-service (a safe subset) and admin edit (all of them).
const EDITABLE_COLUMNS = {
  ownerName: 'owner_name',
  companyName: 'company_name',
  address: 'address',
  lat: 'lat',
  lng: 'lng',
  phoneFixed: 'phone_fixed',
  phoneMobile: 'phone_mobile',
  imageUrl: 'image_url',
  category: 'category',
  serviceMode: 'service_mode',
  rewardThreshold: 'reward_threshold',
  rewardType: 'reward_type',
  rewardValue: 'reward_value',
  status: 'status',
  // The 3 axes + vitrine/booking fields (booleans stored as 0/1 integers).
  modLoyalty: 'mod_loyalty',
  modBooking: 'mod_booking',
  modVitrine: 'mod_vitrine',
  description: 'description',
  bookingMode: 'booking_mode',
};

module.exports = {
  async createProfile(input) {
    await driver.mutate(
      `INSERT INTO partner_profiles (
        user_id, owner_name, company_name, address, lat, lng,
        phone_fixed, phone_mobile, image_url, category, service_mode,
        reward_threshold, reward_type, reward_value,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.category ?? null,
        input.serviceMode ?? null,
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
      `SELECT u.id, u.email, u.created_at, u.suspended_at AS "suspendedAt",
              p.owner_name AS "ownerName",
              p.company_name AS "companyName",
              p.address, p.lat, p.lng,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile",
              p.image_url AS "imageUrl",
              p.category, p.service_mode AS "serviceMode",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type AS "rewardType",
              p.reward_value AS "rewardValue",
              p.status,
              p.mod_loyalty AS "modLoyalty",
              p.mod_booking AS "modBooking",
              p.mod_vitrine AS "modVitrine",
              p.description, p.booking_mode AS "bookingMode",
              p.updated_at AS "updatedAt"
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.id = ? AND u.deleted_at IS NULL`,
      [id],
    );
  },

  // Public directory: only approved, non-suspended partners (audit FP-09).
  // Optional filters: `categories` (array) and `serviceMode`. A partner whose
  // mode is 'les_deux' matches both 'sur_place' and 'a_domicile' filters.
  async listPublic({ limit = 100, offset = 0, categories = null, serviceMode = null } = {}) {
    const params = [];
    let where = `u.deleted_at IS NULL AND u.suspended_at IS NULL AND u.is_demo = 0 AND p.status = 'approved'`;

    if (Array.isArray(categories) && categories.length) {
      where += ` AND p.category IN (${categories.map(() => '?').join(', ')})`;
      params.push(...categories);
    }
    if (serviceMode === 'sur_place' || serviceMode === 'a_domicile') {
      where += ` AND (p.service_mode = ? OR p.service_mode = 'les_deux')`;
      params.push(serviceMode);
    } else if (serviceMode === 'les_deux') {
      where += ` AND p.service_mode = 'les_deux'`;
    }

    params.push(limit, offset);
    return driver.query(
      `SELECT u.id, u.created_at,
              p.owner_name AS "ownerName",
              p.company_name AS "companyName",
              p.address, p.lat, p.lng,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile",
              p.image_url AS "imageUrl",
              p.category, p.service_mode AS "serviceMode",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type AS "rewardType",
              p.reward_value AS "rewardValue",
              p.status,
              p.mod_loyalty AS "modLoyalty",
              p.mod_booking AS "modBooking",
              p.mod_vitrine AS "modVitrine",
              p.description
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );
  },

  // Admin listing for moderation + management. Optional status filter;
  // otherwise all non-deleted partners, newest first. Full fields.
  async listByStatus(status = null) {
    const base = `SELECT u.id, u.email, u.created_at, u.suspended_at AS "suspendedAt",
              p.owner_name AS "ownerName",
              p.company_name AS "companyName",
              p.address, p.lat, p.lng,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile",
              p.image_url AS "imageUrl",
              p.category, p.service_mode AS "serviceMode",
              p.reward_threshold AS "rewardThreshold",
              p.reward_type AS "rewardType",
              p.reward_value AS "rewardValue",
              p.status
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.deleted_at IS NULL AND u.is_demo = 0`;
    if (status) {
      return driver.query(`${base} AND p.status = ? ORDER BY p.created_at DESC`, [status]);
    }
    return driver.query(`${base} ORDER BY p.created_at DESC`);
  },

  // Duplicate detection (audit: no two pros with the same identity). Returns
  // existing non-deleted partners whose domain name + address match. The
  // caller then checks phone overlap to decide.
  async findByNameAndAddress({ ownerName, address }) {
    return driver.query(
      `SELECT u.id,
              p.phone_fixed AS "phoneFixed",
              p.phone_mobile AS "phoneMobile"
       FROM users u
       INNER JOIN partner_profiles p ON p.user_id = u.id
       WHERE u.role = 'partner' AND u.deleted_at IS NULL
         AND lower(trim(p.owner_name)) = lower(trim(?))
         AND lower(trim(p.address))    = lower(trim(?))`,
      [ownerName, address],
    );
  },

  // Operator-only: approve / suspend / reset a partner (audit FP-09).
  async setStatus(userId, status) {
    const res = await driver.mutate(
      `UPDATE partner_profiles SET status = ?, updated_at = ?
       WHERE user_id = ?`,
      [status, Date.now(), userId],
    );
    return res.changes === 1;
  },

  async updateRewardSettings(userId, { rewardThreshold, rewardType, rewardValue }) {
    await driver.mutate(
      `UPDATE partner_profiles
       SET reward_threshold = ?, reward_type = ?, reward_value = ?, updated_at = ?
       WHERE user_id = ?`,
      [rewardThreshold, rewardType, rewardValue ?? null, Date.now(), userId],
    );
  },

  // Dynamic partial update over the whitelisted columns. `fields` is a plain
  // object of jsField -> value; unknown keys are ignored. Returns true if a
  // row was changed. Used by partner self-edit (category/mode/rewards) and by
  // the admin edit endpoint (any field).
  async updateProfileFields(userId, fields) {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields || {})) {
      const col = EDITABLE_COLUMNS[k];
      if (!col) continue;
      sets.push(`${col} = ?`);
      params.push(v === '' ? null : v);
    }
    if (!sets.length) return false;
    sets.push('updated_at = ?');
    params.push(Date.now(), userId);
    const res = await driver.mutate(
      `UPDATE partner_profiles SET ${sets.join(', ')} WHERE user_id = ?`,
      params,
    );
    return res.changes === 1;
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
