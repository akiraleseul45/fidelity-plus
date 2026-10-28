const crypto = require('crypto');
const driver = require('../db/driver');
const partnersRepo = require('../repositories/partners');
const servicesRepo = require('../repositories/services');
const availabilityRepo = require('../repositories/availability');
const settingsRepo = require('../repositories/bookingSettings');
const bookingsRepo = require('../repositories/bookings');
const {
  localToUtcMs,
  todayStr,
  isoWeekday,
  addDays,
  isValidDateStr,
  minutesToLabel,
} = require('../lib/datetime');

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const DEFAULT_APPT_DURATION = 30;
const DEFAULT_TABLE_DURATION = 90;
const DEFAULT_TZ = 'Europe/Paris';

// Statuses that hold a slot, and the moves a pro may make (audit A-10).
const ACTIVE_STATUSES = ['pending', 'confirmed'];
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'done', 'no_show'],
  cancelled: ['confirmed'],
  done: ['no_show', 'confirmed'],
  no_show: ['done', 'confirmed'],
};

// A stored timezone is only trusted if Intl accepts it, so a bad value can
// never crash the booking page (audit A-06).
function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function safeTimezone(tz) {
  return isValidTimezone(tz) ? tz : DEFAULT_TZ;
}

// Places already taken for a slot, from its overlap summary (audit A-11).
// Table mode: every booking shares the restaurant's covers.
// Appointment mode: the pro runs one service at a time, so a booking of
// another service blocks the slot; bookings of the same service fill its
// capacity (e.g. a 10-place class).
function usedPlaces(mode, { total, same, other }) {
  if (mode === 'table') return total;
  return other > 0 ? Infinity : same;
}

function capacityFor(mode, settings, service) {
  return mode === 'table' ? settings.defaultCapacity || 1 : (service && service.capacity) || 1;
}

function generateReference() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `FP-${out}`;
}

// Opening windows [startMin,endMin] for a date, applying weekly rules then the
// one-off exception (a closed exception wins; an open exception overrides).
function windowsFor(rules, exception, weekday) {
  if (exception && exception.isClosed) return [];
  if (exception && !exception.isClosed && exception.startMin != null && exception.endMin != null) {
    return [[exception.startMin, exception.endMin]];
  }
  return rules
    .filter((r) => r.weekday === weekday)
    .map((r) => [r.startMin, r.endMin])
    .sort((a, b) => a[0] - b[0]);
}

// Load + validate the partner and resolve the booking parameters for a date.
// Returns { error } on any guard failure, else the resolved context.
async function resolveContext({ partnerId, serviceId, date }) {
  const partner = await partnersRepo.byId(partnerId);
  if (!partner) return { error: 'unknown_partner' };
  if (partner.status !== 'approved' || partner.suspendedAt) return { error: 'partner_not_approved' };
  if (Number(partner.modBooking) !== 1) return { error: 'booking_disabled' };
  if (!isValidDateStr(date)) return { error: 'invalid_date' };

  const settings = await settingsRepo.getOrCreate(partnerId);
  const mode = partner.bookingMode === 'table' ? 'table' : 'appointment';

  let service = null;
  if (serviceId) {
    service = await servicesRepo.byIdForPartner(serviceId, partnerId);
    if (!service || Number(service.isActive) !== 1) return { error: 'service_unavailable' };
  } else if (mode === 'appointment') {
    // Appointments need a service to know duration/capacity.
    return { error: 'service_required' };
  }

  const duration =
    (service && service.durationMin) || (mode === 'table' ? DEFAULT_TABLE_DURATION : DEFAULT_APPT_DURATION);
  const capacityLimit = capacityFor(mode, settings, service);

  const tz = safeTimezone(settings.timezone);
  const today = todayStr(tz);

  return { partner, settings, mode, service, duration, capacityLimit, tz, today };
}

// Free slots for a specific date. Never invents availability: a slot is only
// returned when it fits an opening window AND has remaining capacity.
async function slotsForDate({ partnerId, serviceId = null, date }) {
  const ctx = await resolveContext({ partnerId, serviceId, date });
  if (ctx.error) return { ok: false, error: ctx.error };

  const { settings, mode, duration, capacityLimit, tz, today } = ctx;
  const empty = { ok: true, date, mode, durationMin: duration, capacity: capacityLimit, slots: [] };

  if (date < today) return empty; // past
  if (date > addDays(today, settings.maxAdvanceDays)) return empty; // too far ahead

  const weekday = isoWeekday(date);
  const [exception, rules] = await Promise.all([
    availabilityRepo.exceptionForDate(partnerId, date),
    availabilityRepo.rulesForPartner(partnerId),
  ]);
  const windows = windowsFor(rules, exception, weekday);
  if (!windows.length) return empty;

  // Day budget (max_per_day): if already reached, nothing is bookable.
  const dayStartMs = localToUtcMs(date, 0, tz);
  const dayEndMs = localToUtcMs(addDays(date, 1), 0, tz);
  if (settings.maxPerDay != null) {
    const dayCount = await bookingsRepo.countActiveForDay({
      partnerId,
      dayStartMs,
      dayEndMs,
    });
    if (dayCount >= settings.maxPerDay) return empty;
  }

  const durationMs = duration * 60000;
  // Buffer: dead time kept after every booking, on both sides of a slot (A-05).
  const bufferMs = (settings.bufferMin || 0) * 60000;
  const active = await bookingsRepo.activeBetween({
    partnerId,
    fromMs: dayStartMs - bufferMs,
    toMs: dayEndMs + durationMs + bufferMs,
  });
  const slotServiceId = ctx.service ? ctx.service.id : null;

  const now = Date.now();
  const earliest = now + (settings.minNoticeMin || 0) * 60000;
  const step = Math.max(settings.slotIntervalMin || 15, 5);

  const slots = [];
  for (const [ws, we] of windows) {
    for (let startMin = ws; startMin + duration <= we; startMin += step) {
      const startsAt = localToUtcMs(date, startMin, tz);
      const endsAt = startsAt + durationMs;
      if (startsAt < earliest) continue;
      const overlap = { total: 0, same: 0, other: 0 };
      for (const b of active) {
        // Postgres returns BIGINT columns as strings: compare as numbers.
        if (Number(b.startsAt) < endsAt + bufferMs && Number(b.endsAt) + bufferMs > startsAt) {
          overlap.total += Number(b.partySize);
          if (slotServiceId && b.serviceId === slotServiceId) overlap.same += Number(b.partySize);
          else overlap.other += 1;
        }
      }
      const remaining = capacityLimit - usedPlaces(mode, overlap);
      if (remaining > 0) {
        slots.push({ time: minutesToLabel(startMin), startMin, startsAt, endsAt, remaining });
      }
    }
  }
  return { ok: true, date, mode, durationMin: duration, capacity: capacityLimit, slots };
}

// Create a booking. Re-validates the slot against live availability and holds
// it atomically to prevent double-booking / over-capacity (sections 8 & 9).
async function createBooking(input) {
  const { partnerId, serviceId = null, date, startMin } = input;
  const ctx = await resolveContext({ partnerId, serviceId, date });
  if (ctx.error) return { ok: false, error: ctx.error };

  const { settings, mode, service, duration, capacityLimit, tz, today } = ctx;

  if (typeof startMin !== 'number' || startMin < 0 || startMin > 1440) {
    return { ok: false, error: 'invalid_slot' };
  }
  if (date < today || date > addDays(today, settings.maxAdvanceDays)) {
    return { ok: false, error: 'out_of_range' };
  }

  // The chosen slot must fall inside a real opening window for that date.
  const weekday = isoWeekday(date);
  const [exception, rules] = await Promise.all([
    availabilityRepo.exceptionForDate(partnerId, date),
    availabilityRepo.rulesForPartner(partnerId),
  ]);
  const windows = windowsFor(rules, exception, weekday);
  const inWindow = windows.some(([ws, we]) => startMin >= ws && startMin + duration <= we);
  if (!inWindow) return { ok: false, error: 'slot_unavailable' };

  const startsAt = localToUtcMs(date, startMin, tz);
  const endsAt = startsAt + duration * 60000;
  const now = Date.now();
  if (startsAt < now + (settings.minNoticeMin || 0) * 60000) {
    return { ok: false, error: 'too_late' };
  }

  const partySize = Math.max(1, parseInt(input.partySize, 10) || 1);
  if (partySize > capacityLimit) return { ok: false, error: 'over_capacity' };

  const dayStartMs = localToUtcMs(date, 0, tz);
  const dayEndMs = localToUtcMs(addDays(date, 1), 0, tz);

  try {
    const result = await driver.transaction(async (tx) => {
      await settingsRepo.lockForBooking(partnerId, tx);
      if (settings.maxPerDay != null) {
        const dayCount = await bookingsRepo.countActiveForDay({ partnerId, dayStartMs, dayEndMs }, tx);
        if (dayCount >= settings.maxPerDay) return { error: 'day_full' };
      }
      const bufferMs = (settings.bufferMin || 0) * 60000;
      const overlap = await bookingsRepo.activeOverlap(
        {
          partnerId,
          startsAt: startsAt - bufferMs,
          endsAt: endsAt + bufferMs,
          serviceId: service ? service.id : null,
        },
        tx,
      );
      if (usedPlaces(mode, overlap) + partySize > capacityLimit) return { error: 'slot_taken' };

      // Unique reference (retry on the rare collision).
      let reference;
      for (let i = 0; i < 10; i++) {
        reference = generateReference();
        if (!(await bookingsRepo.referenceExists(reference, tx))) break;
        reference = null;
      }
      if (!reference) return { error: 'reference_exhausted' };

      const id = await bookingsRepo.insert(
        {
          reference,
          partnerId,
          serviceId: service ? service.id : null,
          clientId: input.clientId || null,
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.trim().toLowerCase(),
          customerPhone: input.customerPhone?.trim() || null,
          partySize,
          startsAt,
          endsAt,
          status: 'confirmed',
          notes: input.notes?.trim() || null,
        },
        tx,
      );
      return { id, reference };
    });

    if (result.error) return { ok: false, error: result.error };
    const booking = await bookingsRepo.byId(result.id);
    return { ok: true, booking, serviceName: service ? service.name : null, partner: ctx.partner };
  } catch (err) {
    return { ok: false, error: 'transaction_failed', detail: err.message };
  }
}

// A pro changes a booking's status. Only logical moves are allowed, and
// putting a booking back on the planning re-checks the slot under the same
// lock as a new booking, so it can't overbook (audit A-10).
async function changeStatus({ booking, status }) {
  if (booking.status === status) return { ok: true, changed: false };
  const allowed = TRANSITIONS[booking.status] || [];
  if (!allowed.includes(status)) return { ok: false, error: 'invalid_transition' };

  const reactivating = !ACTIVE_STATUSES.includes(booking.status) && ACTIVE_STATUSES.includes(status);
  if (!reactivating) {
    await bookingsRepo.setStatus(booking.id, status);
    return { ok: true, changed: true };
  }

  const partnerId = booking.partnerId;
  const [partner, settings] = await Promise.all([
    partnersRepo.byId(partnerId),
    settingsRepo.getOrCreate(partnerId),
  ]);
  const mode = partner && partner.bookingMode === 'table' ? 'table' : 'appointment';
  const service = booking.serviceId ? await servicesRepo.byIdForPartner(booking.serviceId, partnerId) : null;
  const capacityLimit = capacityFor(mode, settings, service);
  const bufferMs = (settings.bufferMin || 0) * 60000;

  const result = await driver.transaction(async (tx) => {
    await settingsRepo.lockForBooking(partnerId, tx);
    const overlap = await bookingsRepo.activeOverlap(
      {
        partnerId,
        startsAt: Number(booking.startsAt) - bufferMs,
        endsAt: Number(booking.endsAt) + bufferMs,
        serviceId: booking.serviceId,
        excludeId: booking.id,
      },
      tx,
    );
    if (usedPlaces(mode, overlap) + Number(booking.partySize) > capacityLimit) {
      return { error: 'slot_taken' };
    }
    await bookingsRepo.setStatus(booking.id, status, tx);
    return {};
  });
  if (result.error) return { ok: false, error: result.error };
  return { ok: true, changed: true };
}

module.exports = {
  isValidTimezone,
  safeTimezone,
  changeStatus,
  generateReference,
  windowsFor,
  slotsForDate,
  createBooking,
};
