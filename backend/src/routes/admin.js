const express = require('express');
const { requireAdmin } = require('../middleware/admin');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { generalLimiter } = require('../middleware/rateLimit');
const authService = require('../services/auth');
const partnersRepo = require('../repositories/partners');
const clientsRepo = require('../repositories/clients');
const usersRepo = require('../repositories/users');
const {
  adminPartnerUpdateSchema,
  adminClientUpdateSchema,
  adminSuspendSchema,
  adminStatusSchema,
} = require('../lib/schemas');
const logger = require('../lib/logger');

const router = express.Router();

// =====================================================================
// BOOTSTRAP — create the admin account (guarded by the shared ADMIN_API_TOKEN)
//
// This is how the FIRST admin account is provisioned, before any admin can
// log in. It needs the server's crypto (CODE_HMAC_SECRET) so it must run on
// the server. The plaintext code is returned ONCE.
// =====================================================================
router.post('/provision', requireAdmin, generalLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email : null;
    const { userId, loginCode } = await authService.createAdmin({ email });
    logger.info({ userId }, '[admin] admin account provisioned');
    res.json({
      success: true,
      userId,
      loginCode, // shown once — the operator must save it
      message: 'Compte admin créé. Note le code, il ne sera plus affiché.',
    });
  } catch (err) {
    next(err);
  }
});

// =====================================================================
// MANAGEMENT — requires an authenticated admin (role=admin JWT)
// =====================================================================
const adminOnly = [requireAuth, requireRole('admin'), generalLimiter];

// ---- Dashboard stats ----
router.get('/stats', adminOnly, async (req, res, next) => {
  try {
    const [clients, partners] = await Promise.all([
      usersRepo.countByRole('client'),
      usersRepo.countByRole('partner'),
    ]);
    const pendingList = await partnersRepo.listByStatus('pending');
    res.json({
      success: true,
      stats: { clients, partners, pendingPartners: pendingList.length },
    });
  } catch (err) {
    next(err);
  }
});

// ---- Partners ----
router.get('/partners', adminOnly, async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const items = await partnersRepo.listByStatus(status);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

// Edit any partner field (status, category, service mode, contact, rewards…).
router.patch('/partners/:id', adminOnly, validate(adminPartnerUpdateSchema), async (req, res, next) => {
  try {
    const existing = await partnersRepo.byId(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Partenaire introuvable.' });
    await partnersRepo.updateProfileFields(req.params.id, req.body);
    const partner = await partnersRepo.byId(req.params.id);
    logger.info({ partnerId: req.params.id, fields: Object.keys(req.body) }, '[admin] partner edited');
    res.json({ success: true, partner });
  } catch (err) {
    next(err);
  }
});

// Moderation status (pending / approved / suspended).
router.put('/partners/:id/status', adminOnly, validate(adminStatusSchema), async (req, res, next) => {
  try {
    const ok = await partnersRepo.setStatus(req.params.id, req.body.status);
    if (!ok) return res.status(404).json({ success: false, error: 'Partenaire introuvable.' });
    logger.info({ partnerId: req.params.id, status: req.body.status }, '[admin] partner status changed');
    const partner = await partnersRepo.byId(req.params.id);
    res.json({ success: true, partner });
  } catch (err) {
    next(err);
  }
});

// Deactivate / reactivate (blocks login + hides from public).
router.post('/partners/:id/suspend', adminOnly, validate(adminSuspendSchema), async (req, res, next) => {
  try {
    const existing = await partnersRepo.byId(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Partenaire introuvable.' });
    await usersRepo.setSuspended(req.params.id, req.body.suspended);
    logger.info({ partnerId: req.params.id, suspended: req.body.suspended }, '[admin] partner suspension');
    const partner = await partnersRepo.byId(req.params.id);
    res.json({ success: true, partner });
  } catch (err) {
    next(err);
  }
});

// Delete (GDPR-safe anonymisation; keeps balances pseudonymised).
router.delete('/partners/:id', adminOnly, async (req, res, next) => {
  try {
    const existing = await partnersRepo.byId(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Partenaire introuvable.' });
    await usersRepo.remove(req.params.id);
    logger.info({ partnerId: req.params.id }, '[admin] partner deleted');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---- Clients ----
router.get('/clients', adminOnly, async (req, res, next) => {
  try {
    const items = await usersRepo.adminListClients();
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.patch('/clients/:id', adminOnly, validate(adminClientUpdateSchema), async (req, res, next) => {
  try {
    const ok = await clientsRepo.adminUpdate(req.params.id, req.body);
    if (!ok) return res.status(404).json({ success: false, error: 'Client introuvable.' });
    const client = await clientsRepo.full(req.params.id);
    logger.info({ clientId: req.params.id, fields: Object.keys(req.body) }, '[admin] client edited');
    res.json({ success: true, client });
  } catch (err) {
    next(err);
  }
});

router.post('/clients/:id/suspend', adminOnly, validate(adminSuspendSchema), async (req, res, next) => {
  try {
    const existing = await clientsRepo.full(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client introuvable.' });
    await usersRepo.setSuspended(req.params.id, req.body.suspended);
    logger.info({ clientId: req.params.id, suspended: req.body.suspended }, '[admin] client suspension');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/clients/:id', adminOnly, async (req, res, next) => {
  try {
    const existing = await clientsRepo.full(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Client introuvable.' });
    await usersRepo.remove(req.params.id);
    logger.info({ clientId: req.params.id }, '[admin] client deleted');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
