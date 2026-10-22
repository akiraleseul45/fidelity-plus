/**
 * Business taxonomy — single source of truth (frontend).
 * Kept in sync with backend/src/lib/business.js (same machine values).
 */

export type CategoryValue =
  | 'restaurant'
  | 'cafe_bar'
  | 'boulangerie'
  | 'coiffeur'
  | 'esthetique'
  | 'barbier'
  | 'mecanique'
  | 'commerce'
  | 'bien_etre'
  | 'autre';

export type ServiceModeValue = 'sur_place' | 'a_domicile' | 'les_deux';

export const CATEGORIES: { value: CategoryValue; label: string; emoji: string }[] = [
  { value: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { value: 'cafe_bar', label: 'Café / Bar', emoji: '☕' },
  { value: 'boulangerie', label: 'Boulangerie / Pâtisserie', emoji: '🥐' },
  { value: 'coiffeur', label: 'Coiffeur', emoji: '💇' },
  { value: 'esthetique', label: 'Esthétique / Ongles', emoji: '💅' },
  { value: 'barbier', label: 'Barbier', emoji: '🧔' },
  { value: 'mecanique', label: 'Mécanique / Auto', emoji: '🔧' },
  { value: 'commerce', label: 'Commerce / Boutique', emoji: '🛍️' },
  { value: 'bien_etre', label: 'Bien-être / Spa', emoji: '💆' },
  { value: 'autre', label: 'Autre', emoji: '🏷️' },
];

export const SERVICE_MODES: { value: ServiceModeValue; label: string; emoji: string }[] = [
  { value: 'sur_place', label: 'Sur place', emoji: '🏠' },
  { value: 'a_domicile', label: 'À domicile', emoji: '🚗' },
  { value: 'les_deux', label: 'Les deux', emoji: '🔁' },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));
const MODE_MAP = Object.fromEntries(SERVICE_MODES.map((m) => [m.value, m]));

export function categoryLabel(v?: string | null): string {
  if (!v) return '';
  return CAT_MAP[v]?.label ?? v;
}
export function categoryEmoji(v?: string | null): string {
  if (!v) return '🏷️';
  return CAT_MAP[v]?.emoji ?? '🏷️';
}
export function serviceModeLabel(v?: string | null): string {
  if (!v) return '';
  return MODE_MAP[v]?.label ?? v;
}
export function serviceModeEmoji(v?: string | null): string {
  if (!v) return '';
  return MODE_MAP[v]?.emoji ?? '';
}

// ---------------------------------------------------------------------
// Reservation platform — modules (3 axes), booking flavour, weekdays.
// Mirror of backend/src/lib/business.js.
// ---------------------------------------------------------------------

export type ModuleValue = 'loyalty' | 'booking' | 'vitrine';
export type BookingModeValue = 'appointment' | 'table';

export const MODULES: { value: ModuleValue; label: string; emoji: string; hint: string }[] = [
  { value: 'loyalty', label: 'Fidélité', emoji: '🎁', hint: 'Carte de fidélité + QR code' },
  { value: 'booking', label: 'Réservation', emoji: '📅', hint: 'Prise de rendez-vous en ligne' },
  { value: 'vitrine', label: 'Vitrine', emoji: '🪟', hint: 'Page publique de présentation' },
];

export const BOOKING_MODES: { value: BookingModeValue; label: string; emoji: string }[] = [
  { value: 'appointment', label: 'Rendez-vous', emoji: '🗓️' },
  { value: 'table', label: 'Table / Couverts', emoji: '🍽️' },
];

// Which booking flavour fits a trade (restaurant/café = table, else RDV).
const BOOKING_MODE_BY_CATEGORY: Record<string, BookingModeValue> = {
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

export function bookingModeForCategory(category?: string | null): BookingModeValue {
  if (!category) return 'appointment';
  return BOOKING_MODE_BY_CATEGORY[category] ?? 'appointment';
}

// ISO weekdays: 1=Monday … 7=Sunday (matches backend availability_rules).
export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Lundi', short: 'Lun' },
  { value: 2, label: 'Mardi', short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi', short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi', short: 'Sam' },
  { value: 7, label: 'Dimanche', short: 'Dim' },
];

// 'HH:MM' <-> minutes-from-midnight helpers (for availability editors).
export function minutesToLabel(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function labelToMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
  if (!m) return null;
  const h = +m[1];
  const min = +m[2];
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
