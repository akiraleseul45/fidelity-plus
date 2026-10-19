const express = require('express');
const reportsRepo = require('../repositories/reports');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimit');
const { reportCreateSchema } = require('../lib/schemas');
const logger = require('../lib/logger');

const router = express.Router();

// A signed-in client or partner sends a problem report to the admin.
router.post('/', requireAuth, generalLimiter, validate(reportCreateSchema), async (req, res, next) => {
  try {
    const { id } = await reportsRepo.create({
      userId: req.user.id,
      role: req.user.role,
      message: req.body.message,
      context: req.body.context || null,
    });
    logger.info({ reportId: id, role: req.user.role }, '[reports] new problem report');
    res.json({ success: true, id, message: 'Merci, ton signalement a bien été envoyé.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
