const driver = require('../db/driver');
const { newId } = require('../lib/crypto');

// jsField -> db column, for safe partial updates.
const EDITABLE_COLUMNS = {
  name: 'name',
  description: 'description',
  category: 'category',
  priceCents: 'price_cents',
  currency: 'currency',
  durationMin: 'duration_min',
  capacity: 'capacity',
  imageUrl: 'image_url',
  isActive: 'is_active',
  isPrivate: 'is_private',
  sortOrder: 'sort_order',
};

const SELECT = `SELECT id, partner_id AS "partnerId", name, description, category,
         price_cents AS "priceCents", currency,
         duration_min AS "durationMin", capacity,
         image_url AS "imageUrl",
         is_active AS "isActive", is_private AS "isPrivate",
         sort_order AS "sortOrder",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM services`;

module.exports = {
  // Full catalogue for the owning partner (management view).
  async listForPartner(partnerId) {
    return driver.query(
      `${SELECT} WHERE partner_id = ? ORDER BY sort_order ASC, created_at ASC`,
      [partnerId],
    );
  },

  // Public catalogue: active, non-private only (what a client can browse/book).
  async listPublic(partnerId) {
    return driver.query(
      `${SELECT} WHERE partner_id = ? AND is_active = 1 AND is_private = 0
       ORDER BY sort_order ASC, created_at ASC`,
      [partnerId],
    );
  },

  async byId(id) {
    return driver.queryOne(`${SELECT} WHERE id = ?`, [id]);
  },

  // Scoped fetch — guarantees the service belongs to the partner.
  async byIdForPartner(id, partnerId) {
    return driver.queryOne(`${SELECT} WHERE id = ? AND partner_id = ?`, [id, partnerId]);
  },

  async create(partnerId, fields) {
    const id = newId();
    const now = Date.now();
    await driver.mutate(
      `INSERT INTO services (
        id, partner_id, name, description, category, price_cents, currency,
        duration_min, capacity, image_url, is_active, is_private, sort_order,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        partnerId,
        fields.name.trim(),
        fields.description?.trim() || null,
        fields.category?.trim() || null,
        fields.priceCents ?? null,
        fields.currency || 'EUR',
        fields.durationMin ?? 30,
        fields.capacity ?? 1,
        fields.imageUrl?.trim() || null,
        fields.isActive === false ? 0 : 1,
        fields.isPrivate === true ? 1 : 0,
        fields.sortOrder ?? 0,
        now,
        now,
      ],
    );
    return this.byId(id);
  },

  // Partial update over the whitelist, scoped to the partner. Booleans are
  // normalised to 0/1. Returns the updated row, or null if nothing changed.
  async update(id, partnerId, fields) {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(fields || {})) {
      const col = EDITABLE_COLUMNS[k];
      if (!col) continue;
      let value = v;
      if (k === 'isActive' || k === 'isPrivate') value = v ? 1 : 0;
      else if (typeof value === 'string') value = value.trim() === '' ? null : value.trim();
      sets.push(`${col} = ?`);
      params.push(value);
    }
    if (!sets.length) return this.byIdForPartner(id, partnerId);
    sets.push('updated_at = ?');
    params.push(Date.now(), id, partnerId);
    const res = await driver.mutate(
      `UPDATE services SET ${sets.join(', ')} WHERE id = ? AND partner_id = ?`,
      params,
    );
    if (res.changes !== 1) return null;
    return this.byIdForPartner(id, partnerId);
  },

  async remove(id, partnerId) {
    const res = await driver.mutate(`DELETE FROM services WHERE id = ? AND partner_id = ?`, [
      id,
      partnerId,
    ]);
    return res.changes === 1;
  },
};
