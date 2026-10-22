const driver = require('../db/driver');
const { newId } = require('../lib/crypto');

/**
 * Availability = recurring weekly rules + one-off date exceptions.
 * Minutes are from local midnight; weekday is ISO (1=Mon … 7=Sun).
 */
module.exports = {
  async rulesForPartner(partnerId) {
    return driver.query(
      `SELECT id, weekday, start_min AS "startMin", end_min AS "endMin"
       FROM availability_rules WHERE partner_id = ?
       ORDER BY weekday ASC, start_min ASC`,
      [partnerId],
    );
  },

  // Replace the whole weekly grid atomically. `rules` = [{weekday,startMin,endMin}].
  async replaceRules(partnerId, rules) {
    await driver.transaction(async (ctx) => {
      await ctx.mutate(`DELETE FROM availability_rules WHERE partner_id = ?`, [partnerId]);
      for (const r of rules) {
        await ctx.mutate(
          `INSERT INTO availability_rules (id, partner_id, weekday, start_min, end_min, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newId(), partnerId, r.weekday, r.startMin, r.endMin, Date.now()],
        );
      }
    });
    return this.rulesForPartner(partnerId);
  },

  // Exceptions from a given date onward (past ones are irrelevant for booking).
  async exceptionsForPartner(partnerId, { fromDate = null } = {}) {
    if (fromDate) {
      return driver.query(
        `SELECT id, date, is_closed AS "isClosed", start_min AS "startMin",
                end_min AS "endMin", reason
         FROM availability_exceptions WHERE partner_id = ? AND date >= ?
         ORDER BY date ASC`,
        [partnerId, fromDate],
      );
    }
    return driver.query(
      `SELECT id, date, is_closed AS "isClosed", start_min AS "startMin",
              end_min AS "endMin", reason
       FROM availability_exceptions WHERE partner_id = ? ORDER BY date ASC`,
      [partnerId],
    );
  },

  async exceptionForDate(partnerId, date) {
    return driver.queryOne(
      `SELECT id, date, is_closed AS "isClosed", start_min AS "startMin",
              end_min AS "endMin", reason
       FROM availability_exceptions WHERE partner_id = ? AND date = ?`,
      [partnerId, date],
    );
  },

  // Upsert a single date exception (unique per partner+date).
  async upsertException(partnerId, { date, isClosed = true, startMin = null, endMin = null, reason = null }) {
    await driver.mutate(
      `INSERT INTO availability_exceptions (id, partner_id, date, is_closed, start_min, end_min, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(partner_id, date) DO UPDATE SET
         is_closed = EXCLUDED.is_closed,
         start_min = EXCLUDED.start_min,
         end_min   = EXCLUDED.end_min,
         reason    = EXCLUDED.reason`,
      [newId(), partnerId, date, isClosed ? 1 : 0, startMin, endMin, reason, Date.now()],
    );
    return this.exceptionForDate(partnerId, date);
  },

  async deleteException(partnerId, date) {
    const res = await driver.mutate(
      `DELETE FROM availability_exceptions WHERE partner_id = ? AND date = ?`,
      [partnerId, date],
    );
    return res.changes === 1;
  },
};
