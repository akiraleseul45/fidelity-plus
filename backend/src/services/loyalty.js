const driver = require('../db/driver');
const { newNonce, signQrToken, verifyQrToken, QR_TTL_SECONDS } = require('../lib/crypto');
const qrRepo = require('../repositories/qrNonces');
const loyaltyRepo = require('../repositories/loyalty');
const partnersRepo = require('../repositories/partners');
const clientsRepo = require('../repositories/clients');
const logger = require('../lib/logger');

/**
 * Loyalty service — async, driver-agnostic.
 *
 * Anti-fraud design:
 *  - QR tokens are JWT-signed with JWT_QR_SECRET (server-only)
 *  - Each QR carries a nonce registered in DB at issuance
 *  - On scan, atomically mark the nonce consumed (race-safe)
 *  - JWT exp = 60s
 */

async function issueQrForClient(clientId) {
  const nonce = newNonce();
  await qrRepo.issue({ nonce, clientId, ttlSeconds: QR_TTL_SECONDS });
  const token = signQrToken({ sub: clientId, nonce });
  return { token, expiresInSeconds: QR_TTL_SECONDS };
}

async function scan({ qrToken, partnerId }) {
  const partner = await partnersRepo.byId(partnerId);
  if (!partner) return { ok: false, error: 'unknown_partner' };

  const payload = verifyQrToken(qrToken);
  if (!payload || payload._error) {
    return { ok: false, error: payload?._error || 'invalid' };
  }
  const { sub: clientId, nonce } = payload;
  if (!clientId || !nonce) return { ok: false, error: 'invalid' };

  const client = await clientsRepo.full(clientId);
  if (!client) return { ok: false, error: 'unknown_client' };

  try {
    return await driver.transaction(async (ctx) => {
      const consumed = await qrRepo.tryConsume({ nonce, partnerId }, ctx);
      if (!consumed) return { ok: false, error: 'already_used' };
      await loyaltyRepo.applyDelta(
        { clientId, partnerId, delta: 1, kind: 'add', nonce },
        ctx,
      );
      // Read fresh balance inside the txn so the result reflects this scan.
      const row = await ctx.queryOne(
        `SELECT points FROM loyalty WHERE client_id = ? AND partner_id = ?`,
        [clientId, partnerId],
      );
      const points = row?.points ?? 0;
      return {
        ok: true,
        points,
        threshold: partner.rewardThreshold,
        reached: points >= partner.rewardThreshold,
        pseudonym: client.pseudonym,
        clientId,
      };
    });
  } catch (err) {
    logger.error({ err }, '[loyalty.scan] transaction failed');
    return { ok: false, error: 'transaction_failed' };
  }
}

async function redeem({ clientId, partnerId }) {
  const partner = await partnersRepo.byId(partnerId);
  if (!partner) return { ok: false, error: 'unknown_partner' };

  const current = await loyaltyRepo.balanceOf(clientId, partnerId);
  if (current < partner.rewardThreshold) {
    return { ok: false, error: 'insufficient_points', points: current };
  }

  try {
    return await driver.transaction(async (ctx) => {
      await loyaltyRepo.applyDelta(
        { clientId, partnerId, delta: -partner.rewardThreshold, kind: 'redeem' },
        ctx,
      );
      const row = await ctx.queryOne(
        `SELECT points FROM loyalty WHERE client_id = ? AND partner_id = ?`,
        [clientId, partnerId],
      );
      return { ok: true, points: row?.points ?? 0 };
    });
  } catch (err) {
    logger.error({ err }, '[loyalty.redeem] transaction failed');
    return { ok: false, error: 'transaction_failed' };
  }
}

async function listForClient(clientId) {
  return loyaltyRepo.byClient(clientId);
}

async function listForPartner(partnerId) {
  return loyaltyRepo.byPartner(partnerId);
}

module.exports = { issueQrForClient, scan, redeem, listForClient, listForPartner };
