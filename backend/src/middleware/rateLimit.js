const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { clientIp } = require('../lib/clientIp');

/**
 * Rate limiting policies — adjusted per route sensitivity.
 *
 * Keyed on the real client IP (Cloudflare's CF-Connecting-IP in prod, see
 * lib/clientIp) and NOT on req.ip, which resolves to a shared proxy hop
 * behind Render (audit FP-02). `ipKeyGenerator` normalises IPv6 to a /64 so
 * a single client can't rotate through its address block.
 *
 * The store is in-memory: at single-instance scale this is fine, but it
 * resets on every Render restart/redeploy. A shared store (Redis) would be
 * needed before scaling to multiple instances — flagged, not introduced here
 * to avoid adding a paid dependency without confirmation.
 *
 * In NODE_ENV=test all limiters are disabled so the suite can exercise
 * routes freely (testing the limiter itself would be flaky and slow).
 */

const IS_TEST = process.env.NODE_ENV === 'test';
const noop = (_req, _res, next) => next();

function keyGenerator(req) {
  return ipKeyGenerator(clientIp(req));
}

function make({ windowMs, limit, message }) {
  if (IS_TEST) return noop;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    message,
  });
}

const authLimiter = make({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { success: false, error: 'Trop de tentatives. Réessaie dans 15 minutes.' },
});

const signupLimiter = make({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { success: false, error: "Trop d'inscriptions depuis cette adresse. Réessaie plus tard." },
});

// Code recovery rotates the account's code, so it must be hard to abuse
// (audit FP-03): a few attempts per hour per IP.
const recoverLimiter = make({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { success: false, error: 'Trop de demandes. Réessaie dans une heure.' },
});

const qrLimiter = make({
  windowMs: 60 * 1000,
  limit: 30,
  message: { success: false, error: 'Trop de requêtes QR. Patiente une minute.' },
});

const scanLimiter = make({
  windowMs: 60 * 1000,
  limit: 60,
  message: { success: false, error: 'Trop de scans. Patiente une minute.' },
});

const generalLimiter = make({
  windowMs: 60 * 1000,
  limit: 120,
});

// Public booking creation — abusable (spam reservations), so cap per IP.
const bookingLimiter = make({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  message: { success: false, error: 'Trop de réservations depuis cette adresse. Réessaie plus tard.' },
});

module.exports = {
  authLimiter,
  signupLimiter,
  recoverLimiter,
  qrLimiter,
  scanLimiter,
  generalLimiter,
  bookingLimiter,
};
