const { verifyAccessToken } = require('../lib/crypto');
const usersRepo = require('../repositories/users');

/**
 * Authentication middleware.
 *
 * Async — does an await usersRepo.byId() to verify the token's subject
 * still exists and isn't soft-deleted.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, error: 'Authentification requise.' });
    }

    const payload = verifyAccessToken(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ success: false, error: 'Token invalide ou expiré.' });
    }

    const user = await usersRepo.byId(payload.sub);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Compte introuvable.' });
    }
    if (user.suspended_at) {
      return res
        .status(403)
        .json({ success: false, error: 'Compte désactivé. Contacte le support.' });
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res
        .status(403)
        .json({ success: false, error: `Accès réservé aux ${role}s.` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
