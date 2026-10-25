const driver = require('../db/driver');

const DEFAULT_TABLE_CAPACITY = 20;

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
  // default_capacity is the number of covers a restaurant (table mode) can
  // seat at once; the column default of 1 made a table for 2 unbookable, so
  // new rows start at DEFAULT_TABLE_CAPACITY (audit A-04).
  async getOrCreate(partnerId) {
    const existing = await this.get(partnerId);
    if (existing) return existing;
    const now = Date.now();
    await driver.mutate(
      `INSERT INTO booking_settings (partner_id, default_capacity, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(partner_id) DO NOTHING`,
      [partnerId, DEFAULT_TABLE_CAPACITY, now, now],
    );
    return this.get(partnerId);
  },

  // Serialise bookings for one partner (audit A-03). Called first inside the
  // booking transaction: the no-op UPDATE takes a row lock on Postgres that is
  // held until COMMIT, so a concurrent booking for the same partner waits and
  // then sees the first one in its capacity check. SQLite already serialises
  // transactions; there it is harmless. The row exists (getOrCreate ran).
  async lockForBooking(partnerId, ctx) {
    await ctx.mutate(
      `UPDATE booking_settings SET updated_at = updated_at WHERE partner_id = ?`,
      [partnerId],
    );
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
