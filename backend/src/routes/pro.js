const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const {
  partnerSelfUpdateSchema,
  bookingSettingsSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
  availabilityRulesSchema,
  availabilityExceptionSchema,
  bookingStatusSchema,
} = require('../lib/schemas');
const partnersRepo = require('../repositories/partners');
const servicesRepo = require('../repositories/services');
const availabilityRepo = require('../repositories/availability');
const settingsRepo = require('../repositories/bookingSettings');
const bookingsRepo = require('../repositories/bookings');
const bookingService = require('../services/booking');
const bookingMail = require('../services/bookingMail');

const router = express.Router();

// Everything here is the signed-in professional acting on their OWN data.
router.use(requireAuth, requireRole('partner'), generalLimiter);

// ---- Profile: module toggles (3 axes) + vitrine + booking flavour ----
router.put('/profile', validate(partnerSelfUpdateSchema), async (req, res, next) => {
  try {
    const fields = { ...req.body };
    // Booleans → 0/1 for the module columns (SQLite can't bind booleans).
    for (const k of ['modLoyalty', 'modBooking', 'modVitrine']) {
      if (k in fields) fields[k] = fields[k] ? 1 : 0;
    }
    await partnersRepo.updateProfileFields(req.user.id, fields);
    const partner = await partnersRepo.byId(req.user.id);
    res.json({ success: true, partner });
  } catch (err) {
    next(err);
  }
});

// ---- Services (prestations) ----
router.get('/services', async (req, res, next) => {
  try {
    const items = await servicesRepo.listForPartner(req.user.id);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.post('/services', validate(serviceCreateSchema), async (req, res, next) => {
  try {
    const service = await servicesRepo.create(req.user.id, req.body);
    res.status(201).json({ success: true, service });
  } catch (err) {
    next(err);
  }
});

router.put('/services/:id', validate(serviceUpdateSchema), async (req, res, next) => {
  try {
    const service = await servicesRepo.update(req.params.id, req.user.id, req.body);
    if (!service) return res.status(404).json({ success: false, error: 'Prestation introuvable.' });
    res.json({ success: true, service });
  } catch (err) {
    next(err);
  }
});

router.delete('/services/:id', async (req, res, next) => {
  try {
    const ok = await servicesRepo.remove(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ success: false, error: 'Prestation introuvable.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---- Availability (weekly grid + exceptions) ----
router.get('/availability', async (req, res, next) => {
  try {
    const [rules, exceptions] = await Promise.all([
      availabilityRepo.rulesForPartner(req.user.id),
      availabilityRepo.exceptionsForPartner(req.user.id),
    ]);
    res.json({ success: true, rules, exceptions });
  } catch (err) {
    next(err);
  }
});

router.put('/availability/rules', validate(availabilityRulesSchema), async (req, res, next) => {
  try {
    const rules = await availabilityRepo.replaceRules(req.user.id, req.body.rules);
    res.json({ success: true, rules });
  } catch (err) {
    next(err);
  }
});

router.put('/availability/exception', validate(availabilityExceptionSchema), async (req, res, next) => {
  try {
    const exception = await availabilityRepo.upsertException(req.user.id, {
      date: req.body.date,
      isClosed: req.body.isClosed !== false,
      startMin: req.body.startMin ?? null,
      endMin: req.body.endMin ?? null,
      reason: req.body.reason || null,
    });
    res.json({ success: true, exception });
  } catch (err) {
    next(err);
  }
});

router.delete('/availability/exception/:date', async (req, res, next) => {
  try {
    const ok = await availabilityRepo.deleteException(req.user.id, req.params.date);
    if (!ok) return res.status(404).json({ success: false, error: 'Exception introuvable.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---- Booking settings ----
router.get('/booking-settings', async (req, res, next) => {
  try {
    const settings = await settingsRepo.getOrCreate(req.user.id);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

router.put('/booking-settings', validate(bookingSettingsSchema), async (req, res, next) => {
  try {
    const settings = await settingsRepo.update(req.user.id, req.body);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

// ---- Bookings (the pro's reservations list + status changes) ----
// scope: 'upcoming' (default) | 'past' | 'all'. Optional status filter.
router.get('/bookings', async (req, res, next) => {
  try {
    const now = Date.now();
    const scope = req.query.scope === 'past' || req.query.scope === 'all' ? req.query.scope : 'upcoming';
    const opts = {};
    if (scope === 'upcoming') opts.fromMs = now - 2 * 60 * 60 * 1000; // small grace for in-progress
    else if (scope === 'past') opts.toMs = now;
    const items = await bookingsRepo.forPartner(req.user.id, opts);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/status', validate(bookingStatusSchema), async (req, res, next) => {
  try {
    const booking = await bookingsRepo.byIdForPartner(req.params.id, req.user.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Réservation introuvable.' });
    const result = await bookingService.changeStatus({ booking, status: req.body.status });
    if (!result.ok) {
      const error =
        result.error === 'slot_taken'
          ? 'Ce créneau est déjà complet : impossible de remettre cette réservation au planning.'
          : 'Ce changement de statut n’est pas possible.';
      return res.status(409).json({ success: false, error });
    }
    const updated = await bookingsRepo.byIdForPartner(booking.id, req.user.id);
    if (result.changed && req.body.status === 'cancelled') {
      bookingMail.fireAndForget('shop cancellation', bookingMail.sendCancelledByShop(updated));
    }
    res.json({ success: true, booking: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
