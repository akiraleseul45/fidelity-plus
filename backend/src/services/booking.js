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
  if (partner.status !== 'approved') return { error: 'partner_not_approved' };
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
  const capacityLimit =
    mode === 'table' ? settings.defaultCapacity || 1 : (service && service.capacity) || 1;

  const tz = settings.timezone || 'Europe/Paris';
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
  const active = await bookingsRepo.activeBetween({
    partnerId,
    fromMs: dayStartMs,
    toMs: dayEndMs + durationMs,
  });

  const now = Date.now();
  const earliest = now + (settings.minNoticeMin || 0) * 60000;
  const step = Math.max(settings.slotIntervalMin || 15, 5);

  const slots = [];
  for (const [ws, we] of windows) {
    for (let startMin = ws; startMin + duration <= we; startMin += step) {
      const startsAt = localToUtcMs(date, startMin, tz);
      const endsAt = startsAt + durationMs;
      if (startsAt < earliest) continue;
      let used = 0;
      for (const b of active) {
        if (b.startsAt < endsAt && b.endsAt > startsAt) used += b.partySize;
      }
      const remaining = capacityLimit - used;
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
      const used = await bookingsRepo.activeOverlapSum({ partnerId, startsAt, endsAt }, tx);
      if (used + partySize > capacityLimit) return { error: 'slot_taken' };

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

module.exports = {
  generateReference,
  windowsFor,
  slotsForDate,
  createBooking,
};
