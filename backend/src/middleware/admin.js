const crypto = require('crypto');

/**
 * Operator-only guard (audit FP-09).
 *
 * There is no end-user admin account. Partner approval is an operator action
 * authenticated by a shared secret `ADMIN_API_TOKEN`, sent as a Bearer token.
 * The comparison is constant-time. If the token is not configured, every
 * admin route answers 404 so the surface does not exist by default (no open
 * door).
 */
function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_API_TOKEN;
  if (!configured || configured.length < 20) {
    // Not configured → the admin API does not exist.
    return res.status(404).json({ success: false, error: 'Route inconnue.' });
  }
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, error: 'Authentification requise.' });
  }
  const a = Buffer.from(token);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: 'Jeton invalide.' });
  }
  next();
}

module.exports = { requireAdmin };
