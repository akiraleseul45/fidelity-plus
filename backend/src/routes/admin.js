const express = require('express');
const { z } = require('zod');
const { requireAdmin } = require('../middleware/admin');
const { validate } = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimit');
const partnersRepo = require('../repositories/partners');
const logger = require('../lib/logger');

const router = express.Router();

const statusSchema = z.object({
  status: z.enum(['pending', 'approved', 'suspended']),
});

/**
 * Operator-only partner moderation (audit FP-09).
 * Guarded by ADMIN_API_TOKEN (see middleware/admin). Not reachable until the
 * token is configured on the server.
 */
router.get('/partners', requireAdmin, generalLimiter, async (req, res, next) => {
  try {
    const status = req.query.status;
    const items = await partnersRepo.listByStatus(
      typeof status === 'string' ? status : null,
    );
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/partners/:id/status',
  requireAdmin,
  generalLimiter,
  validate(statusSchema),
  async (req, res, next) => {
    try {
      const ok = await partnersRepo.setStatus(req.params.id, req.body.status);
      if (!ok) return res.status(404).json({ success: false, error: 'Partenaire introuvable.' });
      logger.info({ partnerId: req.params.id, status: req.body.status }, '[admin] partner status changed');
      const partner = await partnersRepo.byId(req.params.id);
      res.json({ success: true, partner });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
