/**
 * Formatting helpers for the client reservation flow.
 *
 * Shared by ClientPartnerDetailScreen / ClientBookingScreen / ClientBookingsScreen.
 * No payment anywhere — prices are purely informative.
 *
 * (Prefixed "Booking*" so it never collides with the parallel PRO session,
 * which prefixes its own files "Partner*".)
 */

import { BookingStatus } from '../store/api';

/** Informative price: cents → "12,00 €" (fr-FR). Null when no price set. */
export function formatEuro(cents: number | null | undefined, currency = 'EUR'): string | null {
  if (cents == null) return null;
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}

/** A service duration in minutes → "45 min" / "1 h 30". */
export function formatDuration(min: number): string {
  if (!min || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Full, human date + time from an epoch (ms), fr-FR. */
export function formatDateTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Compact date + time from an epoch (ms), fr-FR. */
export function formatDateTimeShort(ms: number): string {
  try {
    return new Date(ms).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export type DateOption = {
  iso: string; // YYYY-MM-DD (local)
  weekday: string; // "lun."
  day: string; // "24"
  month: string; // "oct."
};

/** YYYY-MM-DD in LOCAL time (the calendar day the user picks). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the horizontal date list from today up to `maxAdvanceDays` (inclusive).
 * The slots endpoint still filters out past / too-soon slots server-side.
 */
export function buildDateOptions(maxAdvanceDays: number): DateOption[] {
  const span = Math.max(0, Math.min(maxAdvanceDays || 30, 120));
  const out: DateOption[] = [];
  const base = new Date();
  for (let i = 0; i <= span; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    let weekday = '';
    let day = '';
    let month = '';
    try {
      weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      day = d.toLocaleDateString('fr-FR', { day: 'numeric' });
      month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
    } catch {
      day = String(d.getDate());
    }
    out.push({ iso: toISODate(d), weekday, day, month });
  }
  return out;
}

/** French label for a booking status. */
export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'confirmed':
      return 'Confirmée';
    case 'cancelled':
      return 'Annulée';
    case 'done':
      return 'Honorée';
    case 'no_show':
      return 'Absence';
    default:
      return status;
  }
}
