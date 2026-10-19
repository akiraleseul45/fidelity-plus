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
