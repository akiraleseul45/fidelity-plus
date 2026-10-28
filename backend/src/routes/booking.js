const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generalLimiter, bookingLimiter } = require('../middleware/rateLimit');
const { validate } = require('../middleware/validate');
const { bookingCreateSchema } = require('../lib/schemas');
const { verifyAccessToken } = require('../lib/crypto');
const { isValidDateStr } = require('../lib/datetime');
const usersRepo = require('../repositories/users');
const partnersRepo = require('../repositories/partners');
const servicesRepo = require('../repositories/services');
const settingsRepo = require('../repositories/bookingSettings');
const bookingsRepo = require('../repositories/bookings');
const bookingService = require('../services/booking');
const bookingMail = require('../services/bookingMail');

// Unverified guest emails: cap how many bookings (and so confirmation
// emails) one address can receive per day (audit A-16).
const MAX_BOOKINGS_PER_EMAIL_PER_DAY = 5;

const router = express.Router();

// Optional auth: if a valid client token is present, attach the client id so
// the booking is linked to their account. Absent/invalid → guest booking.
async function attachClientIfPresent(req, _res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme === 'Bearer' && token) {
      const payload = verifyAccessToken(token);
      if (payload && payload.sub) {
        const user = await usersRepo.byId(payload.sub);
        if (user && !user.suspended_at && user.role === 'client') req.clientId = user.id;
      }
    }
  } catch {
    /* ignore — proceed as guest */
  }
  next();
}

// Is this partner page publicly reachable (approved + a public module on)?
// Loyalty counts: a loyalty-only partner is listed in the directory, so its
// page must open too (audit A-01).
function isPublic(partner) {
  return (
    partner &&
    partner.status === 'approved' &&
    !partner.suspendedAt &&
    (Number(partner.modVitrine) === 1 ||
      Number(partner.modBooking) === 1 ||
      Number(partner.modLoyalty) === 1)
  );
}

// ---- Public vitrine payload ----
router.get('/partner/:id', generalLimiter, async (req, res, next) => {
  try {
    const partner = await partnersRepo.byId(req.params.id);
    if (!isPublic(partner)) {
      return res.status(404).json({ success: false, error: 'Page introuvable.' });
    }
    const bookingOn = Number(partner.modBooking) === 1;
    const [services, settings] = await Promise.all([
      bookingOn ? servicesRepo.listPublic(partner.id) : Promise.resolve([]),
      bookingOn ? settingsRepo.getOrCreate(partner.id) : Promise.resolve(null),
    ]);
    res.json({
      success: true,
      partner: {
        id: partner.id,
        companyName: partner.companyName,
        ownerName: partner.ownerName,
        address: partner.address,
        lat: partner.lat,
        lng: partner.lng,
        phoneFixed: partner.phoneFixed,
        phoneMobile: partner.phoneMobile,
        imageUrl: partner.imageUrl,
        description: partner.description,
        category: partner.category,
        serviceMode: partner.serviceMode,
        modLoyalty: Number(partner.modLoyalty) === 1,
        modBooking: bookingOn,
        modVitrine: Number(partner.modVitrine) === 1,
        bookingMode: partner.bookingMode || 'appointment',
        rewardThreshold: partner.rewardThreshold,
        rewardType: partner.rewardType,
        rewardValue: partner.rewardValue,
      },
      services,
      bookingSettings: settings
        ? {
            timezone: bookingService.safeTimezone(settings.timezone),
            maxAdvanceDays: settings.maxAdvanceDays,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Public free slots for a date ----
router.get('/partner/:id/slots', generalLimiter, async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!isValidDateStr(date)) {
      return res.status(400).json({ success: false, error: 'Date invalide.' });
    }
    const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : null;
    const result = await bookingService.slotsForDate({ partnerId: req.params.id, serviceId, date });
    if (!result.ok) {
      return res.status(statusFor(result.error)).json({ success: false, error: humanize(result.error) });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ---- Public booking creation (guest or signed-in client) ----
router.post(
  '/partner/:id/book',
  bookingLimiter,
  attachClientIfPresent,
  validate(bookingCreateSchema),
  async (req, res, next) => {
    try {
      const email = req.body.customerEmail.trim().toLowerCase();
      const recent = await bookingsRepo.countRecentForEmail(email, Date.now() - 24 * 60 * 60 * 1000);
      if (recent >= MAX_BOOKINGS_PER_EMAIL_PER_DAY) {
        return res.status(429).json({
          success: false,
          error: 'Trop de réservations pour cette adresse email aujourd’hui. Réessaie demain.',
        });
      }
      const result = await bookingService.createBooking({
        partnerId: req.params.id,
        serviceId: req.body.serviceId || null,
        clientId: req.clientId || null,
        date: req.body.date,
        startMin: req.body.startMin,
        partySize: req.body.partySize,
        customerName: req.body.customerName,
        customerEmail: req.body.customerEmail,
        customerPhone: req.body.customerPhone,
        notes: req.body.notes,
      });
      if (!result.ok) {
        return res.status(statusFor(result.error)).json({ success: false, error: humanize(result.error) });
      }
      // Confirmation to the client + notice to the pro (never block on mail).
      bookingMail.fireAndForget('new booking', bookingMail.sendNewBooking(result.booking, result.partner));
      res.status(201).json({ success: true, booking: result.booking });
    } catch (err) {
      next(err);
    }
  },
);

// ---- Client: my reservations ----
router.get('/me', requireAuth, requireRole('client'), generalLimiter, async (req, res, next) => {
  try {
    const items = await bookingsRepo.forClient(req.user.id);
    res.json({ success: true, items });
  } catch (err) {
    next(err);
  }
});

// ---- Client: cancel one of my reservations ----
router.post('/:id/cancel', requireAuth, requireRole('client'), generalLimiter, async (req, res, next) => {
  try {
    const booking = await bookingsRepo.byIdForClient(req.params.id, req.user.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Réservation introuvable.' });
    if (booking.status === 'cancelled') {
      return res.json({ success: true, booking });
    }
    if (booking.status !== 'confirmed' && booking.status !== 'pending') {
      return res.status(409).json({ success: false, error: 'Cette réservation ne peut plus être annulée.' });
    }
    await bookingsRepo.setStatus(booking.id, 'cancelled');
    const updated = await bookingsRepo.byIdForClient(booking.id, req.user.id);
    bookingMail.fireAndForget('client cancellation', bookingMail.sendCancelledByClient(updated));
    res.json({ success: true, booking: updated });
  } catch (err) {
    next(err);
  }
});

function humanize(code) {
  switch (code) {
    case 'unknown_partner':      return 'Établissement introuvable.';
    case 'partner_not_approved': return "Cet établissement n'est pas encore activé.";
    case 'booking_disabled':     return "La réservation n'est pas activée pour cet établissement.";
    case 'service_required':     return 'Choisis une prestation.';
    case 'service_unavailable':  return "Cette prestation n'est plus disponible.";
    case 'invalid_date':         return 'Date invalide.';
    case 'invalid_slot':         return 'Créneau invalide.';
    case 'slot_unavailable':     return "Ce créneau n'est pas proposé.";
    case 'out_of_range':         return 'Cette date est hors de la période réservable.';
    case 'too_late':             return 'Ce créneau est trop proche pour être réservé.';
    case 'over_capacity':        return 'Nombre de personnes trop élevé pour ce créneau.';
    case 'slot_taken':           return 'Désolé, ce créneau vient d’être pris. Choisis-en un autre.';
    case 'day_full':             return 'Plus de disponibilité pour cette journée.';
    default:                     return 'Réservation impossible.';
  }
}

function statusFor(code) {
  switch (code) {
    case 'unknown_partner':
    case 'service_unavailable':  return 404;
    case 'partner_not_approved':
    case 'booking_disabled':     return 403;
    case 'slot_taken':
    case 'day_full':             return 409;
    case 'transaction_failed':   return 500;
    default:                     return 400;
  }
}

module.exports = router;
