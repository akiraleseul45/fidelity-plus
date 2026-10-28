const mailer = require('../../mailer');
const logger = require('../lib/logger');
const partnersRepo = require('../repositories/partners');
const servicesRepo = require('../repositories/services');
const settingsRepo = require('../repositories/bookingSettings');
const { safeTimezone } = require('./booking');

/**
 * Reservation emails. Every send is fire-and-forget: a mail failure is
 * logged and never blocks or fails the HTTP response.
 */

// French, timezone-aware labels for a booking.
async function labelsFor(booking) {
  const settings = await settingsRepo.getOrCreate(booking.partnerId);
  const tz = safeTimezone(settings?.timezone);
  const start = new Date(Number(booking.startsAt));
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(start);
  const timeLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
  return { dateLabel, timeLabel };
}

function common(booking, partner, labels) {
  return {
    reference: booking.reference,
    companyName: partner?.companyName || booking.partnerName || 'Fidelity Plus',
    customerName: booking.customerName,
    serviceName: booking.serviceName || '',
    partySize: booking.partySize,
    ...labels,
  };
}

async function sendConfirmation(booking, partner) {
  if (!booking.customerEmail) return;
  const labels = await labelsFor(booking);
  let priceLabel = '';
  if (booking.serviceId) {
    const svc = await servicesRepo.byId(booking.serviceId);
    if (svc && svc.priceCents != null) {
      priceLabel = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: svc.currency || 'EUR',
      }).format(svc.priceCents / 100);
    }
  }
  await mailer.sendBookingConfirmationMail({
    to: booking.customerEmail,
    reference: booking.reference,
    companyName: partner?.companyName || booking.partnerName || 'Fidelity Plus',
    serviceName: booking.serviceName || '',
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    partySize: booking.partySize,
    address: partner?.address || '',
    phone: partner?.phoneMobile || partner?.phoneFixed || '',
    priceLabel,
    modeLabel: partner?.bookingMode || 'appointment',
  });
}

// New booking → confirmation to the client + notice to the pro.
async function sendNewBooking(booking, partner) {
  await sendConfirmation(booking, partner);
  if (partner?.email) {
    const labels = await labelsFor(booking);
    await mailer.sendProNewBookingMail({
      to: partner.email,
      ...common(booking, partner, labels),
      phone: booking.customerPhone || '',
    });
  }
}

// Client cancelled → notice to the pro.
async function sendCancelledByClient(booking) {
  const partner = await partnersRepo.byId(booking.partnerId);
  if (!partner?.email) return;
  const labels = await labelsFor(booking);
  await mailer.sendProCancelledMail({
    to: partner.email,
    ...common(booking, partner, labels),
    phone: booking.customerPhone || '',
  });
}

// Pro cancelled → notice to the client.
async function sendCancelledByShop(booking) {
  if (!booking.customerEmail) return;
  const partner = await partnersRepo.byId(booking.partnerId);
  const labels = await labelsFor(booking);
  await mailer.sendClientCancelledByShopMail({
    to: booking.customerEmail,
    ...common(booking, partner, labels),
    phone: partner?.phoneMobile || partner?.phoneFixed || '',
  });
}

// Run a send without awaiting it; log failures.
function fireAndForget(label, promise) {
  promise.catch((err) => logger.warn({ err: err.message }, `[booking] ${label} email failed`));
}

module.exports = {
  labelsFor,
  sendNewBooking,
  sendCancelledByClient,
  sendCancelledByShop,
  fireAndForget,
};
