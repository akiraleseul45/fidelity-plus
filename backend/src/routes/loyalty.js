const express = require('express');
const loyaltyService = require('../services/loyalty');
const { requireAuth, requireRole } = require('../middleware/auth');
const { qrLimiter, scanLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { scanQrSchema, redeemSchema, updateRewardSchema } = require('../lib/schemas');
const partnersRepo = require('../repositories/partners');

const router = express.Router();

router.get('/qr', requireAuth, requireRole('client'), qrLimiter, async (req, res, next) => {
  try {
    const { token, expiresInSeconds } = await loyaltyService.issueQrForClient(req.user.id);
    res.json({ success: true, qrToken: token, expiresInSeconds });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/scan',
  requireAuth,
  requireRole('partner'),
  scanLimiter,
  validate(scanQrSchema),
  async (req, res, next) => {
    try {
      const result = await loyaltyService.scan({
        qrToken: req.body.qrToken,
        partnerId: req.user.id,
      });
      if (!result.ok) {
        const httpStatus = result.error === 'already_used' ? 409 : 400;
        return res.status(httpStatus).json({ success: false, error: humanizeError(result.error) });
      }
      res.json({
        success: true,
        points: result.points,
        threshold: result.threshold,
        reached: result.reached,
        pseudonym: result.pseudonym,
        clientId: result.clientId,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/redeem',
  requireAuth,
  requireRole('partner'),
  validate(redeemSchema),
  async (req, res, next) => {
    try {
      const result = await loyaltyService.redeem({
        clientId: req.body.clientId,
        partnerId: req.user.id,
      });
      if (!result.ok) {
        const httpStatus = result.error === 'insufficient_points' ? 400 : 500;
        return res.status(httpStatus).json({ success: false, error: humanizeError(result.error) });
      }
      res.json({ success: true, points: result.points });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/me', requireAuth, requireRole('client'), async (req, res, next) => {
  try {
    const items = await loyaltyService.listForClient(req.user.id);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.get('/partner', requireAuth, requireRole('partner'), async (req, res, next) => {
  try {
    const items = await loyaltyService.listForPartner(req.user.id);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/partner/settings',
  requireAuth,
  requireRole('partner'),
  validate(updateRewardSchema),
  async (req, res, next) => {
    try {
      await partnersRepo.updateRewardSettings(req.user.id, req.body);
      const partner = await partnersRepo.byId(req.user.id);
      res.json({ success: true, partner });
    } catch (err) {
      next(err);
    }
  },
);

function humanizeError(code) {
  switch (code) {
    case 'expired':             return 'Le QR code a expiré. Demande-en un nouveau.';
    case 'invalid':             return 'QR code invalide.';
    case 'already_used':        return 'Ce QR code a déjà été utilisé.';
    case 'unknown_partner':     return 'Compte professionnel introuvable.';
    case 'unknown_client':      return 'Client introuvable.';
    case 'insufficient_points': return 'Pas assez de points pour cette récompense.';
    default:                    return 'Opération impossible.';
  }
}

module.exports = router;
