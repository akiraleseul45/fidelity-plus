/**
 * Lightweight UI-side types. The authoritative model lives in the backend
 * (see `backend/src/db/schema.sql`). These types only describe what the
 * UI consumes from API responses — they should stay narrow.
 */

export type RewardType = 'free_meal' | 'discount';

export type PartnerStatus = 'pending' | 'approved' | 'suspended';

export type LoyaltyView = {
  partnerId: string;
  points: number;
  lastScanAt: number | null;
};
