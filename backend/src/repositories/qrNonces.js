const driver = require('../db/driver');
const logger = require('../lib/logger');

const PURGE_INTERVAL_MS = 10 * 60 * 1000;

let purgeTimer = null;

module.exports = {
  async issue({ nonce, clientId, ttlSeconds }, dbCtx = null) {
    const ctx = dbCtx || driver;
    const now = Date.now();
    await ctx.mutate(
      `INSERT INTO qr_nonces (nonce, client_id, issued_at, expires_at) VALUES (?, ?, ?, ?)`,
      [nonce, clientId, now, now + ttlSeconds * 1000],
    );
  },

  /**
   * Atomically consume a nonce. Returns true if the row was both fresh
   * (not consumed) and not expired. Race-safe via the UPDATE ... WHERE
   * clause — concurrent scanners will see one winner.
   */
  async tryConsume({ nonce, partnerId }, dbCtx = null) {
    const ctx = dbCtx || driver;
    const result = await ctx.mutate(
      `UPDATE qr_nonces
       SET consumed_at = ?, consumed_by = ?
       WHERE nonce = ? AND consumed_at IS NULL AND expires_at >= ?`,
      [Date.now(), partnerId, nonce, Date.now()],
    );
    return result.changes === 1;
  },

  async find(nonce) {
    return driver.queryOne(
      `SELECT nonce, client_id AS "clientId", issued_at AS "issuedAt",
              expires_at AS "expiresAt", consumed_at AS "consumedAt"
       FROM qr_nonces WHERE nonce = ?`,
      [nonce],
    );
  },

  /** Housekeeping — remove expired nonces. */
  async purgeExpired() {
    const result = await driver.mutate(`DELETE FROM qr_nonces WHERE expires_at < ?`, [
      Date.now(),
    ]);
    return result.changes;
  },

  startPurgeLoop() {
    if (purgeTimer) return;
    const run = async () => {
      try {
        const removed = await this.purgeExpired();
        if (removed > 0) logger.debug({ removed }, '[qrNonces] purged expired');
      } catch (err) {
        logger.warn({ err }, '[qrNonces] purge failed');
      }
    };
    setTimeout(() => run(), 5000);
    purgeTimer = setInterval(() => run(), PURGE_INTERVAL_MS);
    if (typeof purgeTimer.unref === 'function') purgeTimer.unref();
  },

  stopPurgeLoop() {
    if (purgeTimer) {
      clearInterval(purgeTimer);
      purgeTimer = null;
    }
  },
};
