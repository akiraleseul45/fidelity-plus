const rateLimit = require('express-rate-limit');

/**
 * Rate limiting policies — adjusted per route sensitivity.
 *
 * In prod (Redis): switch the store. For SQLite/single-node deploys the
 * default in-memory store is fine.
 *
 * In NODE_ENV=test all limiters are disabled so the suite can exercise
 * routes freely (testing the limiter itself would be flaky and slow).
 */

const IS_TEST = process.env.NODE_ENV === 'test';
const noop = (_req, _res, next) => next();

function make({ windowMs, limit, message }) {
  if (IS_TEST) return noop;
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
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

module.exports = { authLimiter, signupLimiter, qrLimiter, scanLimiter, generalLimiter };
