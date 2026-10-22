/**
 * Business taxonomy — single source of truth (backend).
 *
 * Partner categories (one per partner) and service modes. Kept in sync with
 * the frontend copy at app/src/constants/business.ts. Values are stable
 * machine keys; labels live in the frontend for display/i18n.
 */

const CATEGORY_VALUES = [
  'restaurant',
  'cafe_bar',
  'boulangerie',
  'coiffeur',
  'esthetique',
  'barbier',
  'mecanique',
  'commerce',
  'bien_etre',
  'autre',
];

const SERVICE_MODE_VALUES = ['sur_place', 'a_domicile', 'les_deux'];

const DEFAULT_CATEGORY = 'autre';
const DEFAULT_SERVICE_MODE = 'sur_place';

// ---------------------------------------------------------------------
// The 3 toggleable axes (modules) a partner can turn ON/OFF.
//   - loyalty : the historical loyalty card + QR  (ON by default)
//   - booking : online reservation engine          (opt-in)
//   - vitrine : public presentation page           (opt-in)
// ---------------------------------------------------------------------
const MODULE_VALUES = ['loyalty', 'booking', 'vitrine'];
const DEFAULT_MODULES = { loyalty: true, booking: false, vitrine: false };

// ---------------------------------------------------------------------
// Booking flavour. Appointment = slot-based RDV (coiffeur, esthétique,
// mécanique…). Table = covers per service window (restaurant, café/bar).
// Derived from the trade at signup, but the pro can override it afterwards.
// ---------------------------------------------------------------------
const BOOKING_MODE_VALUES = ['appointment', 'table'];
const DEFAULT_BOOKING_MODE = 'appointment';

const BOOKING_MODE_BY_CATEGORY = {
  restaurant: 'table',
  cafe_bar: 'table',
  boulangerie: 'appointment',
  coiffeur: 'appointment',
  esthetique: 'appointment',
  barbier: 'appointment',
  mecanique: 'appointment',
  commerce: 'appointment',
  bien_etre: 'appointment',
  autre: 'appointment',
};

function bookingModeForCategory(category) {
  return BOOKING_MODE_BY_CATEGORY[category] || DEFAULT_BOOKING_MODE;
}

module.exports = {
  CATEGORY_VALUES,
  SERVICE_MODE_VALUES,
  DEFAULT_CATEGORY,
  DEFAULT_SERVICE_MODE,
  MODULE_VALUES,
  DEFAULT_MODULES,
  BOOKING_MODE_VALUES,
  DEFAULT_BOOKING_MODE,
  bookingModeForCategory,
};
