const driver = require('../db/driver');
const { newId } = require('../lib/crypto');

// Bookings that still hold a slot (block it against double-booking).
const ACTIVE = `status IN ('pending', 'confirmed')`;

const SELECT = `SELECT b.id, b.reference, b.partner_id AS "partnerId", b.service_id AS "serviceId",
         b.client_id AS "clientId",
         b.customer_name AS "customerName", b.customer_email AS "customerEmail",
         b.customer_phone AS "customerPhone", b.party_size AS "partySize",
         b.starts_at AS "startsAt", b.ends_at AS "endsAt", b.status, b.notes,
         b.created_at AS "createdAt", b.updated_at AS "updatedAt",
         b.cancelled_at AS "cancelledAt",
         sv.name AS "serviceName",
         pp.company_name AS "partnerName"
  FROM bookings b
  LEFT JOIN services sv ON sv.id = b.service_id
  LEFT JOIN partner_profiles pp ON pp.user_id = b.partner_id`;

module.exports = {
  // Sum of party sizes of active bookings that OVERLAP [startsAt, endsAt) for a
  // partner. Overlap test: existing.start < new.end AND existing.end > new.start.
  // Optional `ctx` runs it inside a transaction (for atomic conflict checks).
  async activeOverlapSum({ partnerId, startsAt, endsAt, excludeId = null }, ctx = driver) {
    const params = [partnerId, endsAt, startsAt];
    let sql = `SELECT COALESCE(SUM(party_size), 0) AS total FROM bookings
               WHERE partner_id = ? AND ${ACTIVE}
                 AND starts_at < ? AND ends_at > ?`;
    if (excludeId) {
      sql += ` AND id <> ?`;
      params.push(excludeId);
    }
    const row = await ctx.queryOne(sql, params);
    return Number(row?.total || 0);
  },

  // Count of active bookings whose start falls within a day window.
  async countActiveForDay({ partnerId, dayStartMs, dayEndMs }, ctx = driver) {
    const row = await ctx.queryOne(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE partner_id = ? AND ${ACTIVE} AND starts_at >= ? AND starts_at < ?`,
      [partnerId, dayStartMs, dayEndMs],
    );
    return Number(row?.n || 0);
  },

  // All active bookings overlapping a time range — used to compute free slots.
  async activeBetween({ partnerId, fromMs, toMs }) {
    return driver.query(
      `SELECT starts_at AS "startsAt", ends_at AS "endsAt", party_size AS "partySize",
              service_id AS "serviceId"
       FROM bookings
       WHERE partner_id = ? AND ${ACTIVE} AND starts_at < ? AND ends_at > ?
       ORDER BY starts_at ASC`,
      [partnerId, toMs, fromMs],
    );
  },

  async insert(fields, ctx = driver) {
    const id = newId();
    const now = Date.now();
    await ctx.mutate(
      `INSERT INTO bookings (
        id, reference, partner_id, service_id, client_id,
        customer_name, customer_email, customer_phone, party_size,
        starts_at, ends_at, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        fields.reference,
        fields.partnerId,
        fields.serviceId ?? null,
        fields.clientId ?? null,
        fields.customerName,
        fields.customerEmail,
        fields.customerPhone ?? null,
        fields.partySize ?? 1,
        fields.startsAt,
        fields.endsAt,
        fields.status || 'confirmed',
        fields.notes ?? null,
        now,
        now,
      ],
    );
    return id;
  },

  async referenceExists(reference, ctx = driver) {
    const row = await ctx.queryOne(`SELECT 1 AS x FROM bookings WHERE reference = ?`, [reference]);
    return !!row;
  },

  async byId(id) {
    return driver.queryOne(`${SELECT} WHERE b.id = ?`, [id]);
  },

  async byIdForClient(id, clientId) {
    return driver.queryOne(`${SELECT} WHERE b.id = ? AND b.client_id = ?`, [id, clientId]);
  },

  async byIdForPartner(id, partnerId) {
    return driver.queryOne(`${SELECT} WHERE b.id = ? AND b.partner_id = ?`, [id, partnerId]);
  },

  // A signed-in client's own bookings (newest start first).
  async forClient(clientId) {
    return driver.query(`${SELECT} WHERE b.client_id = ? ORDER BY b.starts_at DESC`, [clientId]);
  },

  // Partner's bookings, optionally within a time window and/or status.
  async forPartner(partnerId, { fromMs = null, toMs = null, status = null } = {}) {
    const params = [partnerId];
    let where = `b.partner_id = ?`;
    if (fromMs != null) {
      where += ` AND b.starts_at >= ?`;
      params.push(fromMs);
    }
    if (toMs != null) {
      where += ` AND b.starts_at < ?`;
      params.push(toMs);
    }
    if (status) {
      where += ` AND b.status = ?`;
      params.push(status);
    }
    return driver.query(`${SELECT} WHERE ${where} ORDER BY b.starts_at ASC`, params);
  },

  async setStatus(id, status) {
    const now = Date.now();
    const cancelled = status === 'cancelled' ? now : null;
    const res = await driver.mutate(
      `UPDATE bookings SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?`,
      [status, cancelled, now, id],
    );
    return res.changes === 1;
  },
};
