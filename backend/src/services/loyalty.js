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

// A partner must be approved before it can scan or redeem (audit FP-09).
// `byId` never returns a soft-deleted partner.
function partnerGate(partner) {
  if (!partner) return 'unknown_partner';
  if (partner.status !== 'approved') return 'partner_not_approved';
  return null;
}

// Verify a QR token and return { clientId, nonce } or an error string.
function readQr(qrToken) {
  const payload = verifyQrToken(qrToken);
  if (!payload || payload._error) return { error: payload?._error || 'invalid' };
  const { sub: clientId, nonce } = payload;
  if (!clientId || !nonce) return { error: 'invalid' };
  return { clientId, nonce };
}

async function scan({ qrToken, partnerId }) {
  const partner = await partnersRepo.byId(partnerId);
  const gate = partnerGate(partner);
  if (gate) return { ok: false, error: gate };

  const qr = readQr(qrToken);
  if (qr.error) return { ok: false, error: qr.error };
  const { clientId, nonce } = qr;

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

// Sentinel used to roll back the redeem transaction when the balance is
// insufficient, so the consumed nonce is NOT lost (the client can retry).
const INSUFFICIENT = 'INSUFFICIENT_POINTS';

/**
 * Redeem a reward. Gated by the client's live QR (audit FP-08): the client
 * must present a fresh QR, proving presence, exactly like a scan. The redeem
 * itself is atomic (audit FP-07) via loyaltyRepo.tryRedeem.
 */
async function redeem({ qrToken, partnerId }) {
  const partner = await partnersRepo.byId(partnerId);
  const gate = partnerGate(partner);
  if (gate) return { ok: false, error: gate };

  const qr = readQr(qrToken);
  if (qr.error) return { ok: false, error: qr.error };
  const { clientId, nonce } = qr;

  const client = await clientsRepo.full(clientId);
  if (!client) return { ok: false, error: 'unknown_client' };

  try {
    return await driver.transaction(async (ctx) => {
      const consumed = await qrRepo.tryConsume({ nonce, partnerId }, ctx);
      if (!consumed) return { ok: false, error: 'already_used' };
      const ok = await loyaltyRepo.tryRedeem(
        { clientId, partnerId, threshold: partner.rewardThreshold },
        ctx,
      );
      if (!ok) {
        // Roll back so the nonce is not consumed on a failed redeem.
        const e = new Error(INSUFFICIENT);
        e.code = INSUFFICIENT;
        throw e;
      }
      const row = await ctx.queryOne(
        `SELECT points FROM loyalty WHERE client_id = ? AND partner_id = ?`,
        [clientId, partnerId],
      );
      return {
        ok: true,
        points: row?.points ?? 0,
        pseudonym: client.pseudonym,
        clientId,
      };
    });
  } catch (err) {
    if (err && err.code === INSUFFICIENT) {
      return { ok: false, error: 'insufficient_points' };
    }
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
