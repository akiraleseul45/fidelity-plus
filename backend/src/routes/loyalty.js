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
        return res.status(httpStatusFor(result.error)).json({
          success: false,
          error: humanizeError(result.error),
        });
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
  scanLimiter,
  validate(redeemSchema),
  async (req, res, next) => {
    try {
      const result = await loyaltyService.redeem({
        qrToken: req.body.qrToken,
        partnerId: req.user.id,
      });
      if (!result.ok) {
        return res.status(httpStatusFor(result.error)).json({
          success: false,
          error: humanizeError(result.error),
        });
      }
      res.json({
        success: true,
        points: result.points,
        pseudonym: result.pseudonym,
        clientId: result.clientId,
      });
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

// Recent activity (points earned + rewards used) for the signed-in client.
router.get('/history', requireAuth, requireRole('client'), async (req, res, next) => {
  try {
    const items = await loyaltyService.historyForClient(req.user.id);
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
      const { rewardThreshold, rewardType, rewardValue, category, serviceMode } = req.body;
      await partnersRepo.updateRewardSettings(req.user.id, {
        rewardThreshold,
        rewardType,
        rewardValue,
      });
      // Optionally update the partner's own category / service mode.
      const selfFields = {};
      if (category !== undefined) selfFields.category = category;
      if (serviceMode !== undefined) selfFields.serviceMode = serviceMode;
      if (Object.keys(selfFields).length) {
        await partnersRepo.updateProfileFields(req.user.id, selfFields);
      }
      const partner = await partnersRepo.byId(req.user.id);
      res.json({ success: true, partner });
    } catch (err) {
      next(err);
    }
  },
);

function humanizeError(code) {
  switch (code) {
    case 'expired':              return 'Le QR code a expiré. Demande-en un nouveau.';
    case 'invalid':              return 'QR code invalide.';
    case 'already_used':         return 'Ce QR code a déjà été utilisé.';
    case 'unknown_partner':      return 'Compte professionnel introuvable.';
    case 'partner_not_approved': return "Ton compte professionnel n'est pas encore validé.";
    case 'unknown_client':       return 'Client introuvable.';
    case 'insufficient_points':  return 'Pas assez de points pour cette récompense.';
    default:                     return 'Opération impossible.';
  }
}

function httpStatusFor(code) {
  switch (code) {
    case 'already_used':         return 409;
    case 'partner_not_approved': return 403;
    case 'transaction_failed':   return 500;
    default:                     return 400; // invalid, expired, unknown_*, insufficient_points
  }
}

module.exports = router;
