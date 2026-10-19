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

module.exports = {
  CATEGORY_VALUES,
  SERVICE_MODE_VALUES,
  DEFAULT_CATEGORY,
  DEFAULT_SERVICE_MODE,
};
