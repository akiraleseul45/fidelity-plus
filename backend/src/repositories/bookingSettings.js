const driver = require('../db/driver');

const EDITABLE_COLUMNS = {
  slotIntervalMin: 'slot_interval_min',
  bufferMin: 'buffer_min',
  minNoticeMin: 'min_notice_min',
  maxAdvanceDays: 'max_advance_days',
  maxPerDay: 'max_per_day',
  defaultCapacity: 'default_capacity',
  timezone: 'timezone',
};

const SELECT = `SELECT partner_id AS "partnerId",
         slot_interval_min AS "slotIntervalMin",
         buffer_min AS "bufferMin",
         min_notice_min AS "minNoticeMin",
         max_advance_days AS "maxAdvanceDays",
         max_per_day AS "maxPerDay",
         default_capacity AS "defaultCapacity",
         timezone
  FROM booking_settings`;

module.exports = {
  async get(partnerId) {
    return driver.queryOne(`${SELECT} WHERE partner_id = ?`, [partnerId]);
  },

  // Return existing settings or lazily create a default row for the partner.
  async getOrCreate(partnerId) {
    const existing = await this.get(partnerId);
    if (existing) return existing;
    const now = Date.now();
    await driver.mutate(
      `INSERT INTO booking_settings (partner_id, created_at, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(partner_id) DO NOTHING`,
      [partnerId, now, now],
    );
    return this.get(partnerId);
  },

  async update(partnerId, fields) {
    await this.getOrCreate(partnerId);
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields || {})) {
      const col = EDITABLE_COLUMNS[k];
      if (!col) continue;
      sets.push(`${col} = ?`);
      params.push(v);
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      params.push(Date.now(), partnerId);
      await driver.mutate(
        `UPDATE booking_settings SET ${sets.join(', ')} WHERE partner_id = ?`,
        params,
      );
    }
    return this.get(partnerId);
  },
};
