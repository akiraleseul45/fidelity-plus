const driver = require('../db/driver');
const { newId } = require('../lib/crypto');

/**
 * Problem reports sent by clients/partners, read + managed by the admin.
 */
module.exports = {
  async create({ userId, role, message, context }) {
    const id = newId();
    await driver.mutate(
      `INSERT INTO reports (id, user_id, role, message, context, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      [id, userId ?? null, role ?? null, message, context ?? null, Date.now()],
    );
    return { id };
  },

  // Admin listing with the reporter's display name (pseudonym / company).
  // Optional status filter. Newest first.
  async listAll(status = null) {
    const base = `
      SELECT r.id, r.user_id AS "userId", r.role, r.message, r.context,
             r.status, r.created_at AS "createdAt", r.resolved_at AS "resolvedAt",
             COALESCE(cp.pseudonym, pp.company_name) AS "reporterName",
             u.email AS "reporterEmail",
             CASE WHEN u.deleted_at IS NOT NULL THEN 1 ELSE 0 END AS "reporterDeleted"
      FROM reports r
      LEFT JOIN users u            ON u.id = r.user_id
      LEFT JOIN client_profiles cp ON cp.user_id = r.user_id
      LEFT JOIN partner_profiles pp ON pp.user_id = r.user_id`;
    if (status) {
      return driver.query(`${base} WHERE r.status = ? ORDER BY r.created_at DESC`, [status]);
    }
    return driver.query(`${base} ORDER BY r.created_at DESC`);
  },

  async setStatus(id, status) {
    const res = await driver.mutate(
      `UPDATE reports SET status = ?, resolved_at = ? WHERE id = ?`,
      [status, status === 'resolved' ? Date.now() : null, id],
    );
    return res.changes === 1;
  },

  async remove(id) {
    const res = await driver.mutate(`DELETE FROM reports WHERE id = ?`, [id]);
    return res.changes === 1;
  },

  async countOpen() {
    const row = await driver.queryOne(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`);
    return Number(row?.n || 0);
  },
};
