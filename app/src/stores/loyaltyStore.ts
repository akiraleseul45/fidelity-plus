import { create } from 'zustand';
import {
  ClientLoyaltyItem,
  PartnerLoyaltyItem,
  apiClientLoyalty,
  apiGetQr,
  apiPartnerLoyalty,
  apiRedeem,
  apiScan,
  apiUpdatePartnerSettings,
} from '../store/api';
import { useAuthStore } from './authStore';

/**
 * Loyalty store — points + QR state. Pulls from the backend on demand.
 *
 * Selectors are exposed so screens only re-render on the data they read,
 * e.g. `useLoyaltyStore((s) => s.clientLoyalty)` re-renders only when
 * the client loyalty list changes.
 */

type LoyaltyState = {
  clientLoyalty: ClientLoyaltyItem[];
  partnerLoyalty: PartnerLoyaltyItem[];
  loadingClient: boolean;
  loadingPartner: boolean;

  refreshClientLoyalty: () => Promise<void>;
  refreshPartnerLoyalty: () => Promise<void>;
  refreshQr: () => Promise<string | null>;
  scanQr: (qrToken: string) => ReturnType<typeof apiScan>;
  redeemReward: (qrToken: string) => ReturnType<typeof apiRedeem>;
  updatePartnerSettings: (settings: {
    rewardThreshold: number;
    rewardType: 'free_meal' | 'discount';
    rewardValue?: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  clear: () => void;
};

export const useLoyaltyStore = create<LoyaltyState>((set, get) => ({
  clientLoyalty: [],
  partnerLoyalty: [],
  loadingClient: false,
  loadingPartner: false,

  async refreshClientLoyalty() {
    set({ loadingClient: true });
    try {
      const r = await apiClientLoyalty();
      if (r.success && r.items) set({ clientLoyalty: r.items });
    } finally {
      set({ loadingClient: false });
    }
  },

  async refreshPartnerLoyalty() {
    set({ loadingPartner: true });
    try {
      const r = await apiPartnerLoyalty();
      if (r.success && r.items) set({ partnerLoyalty: r.items });
    } finally {
      set({ loadingPartner: false });
    }
  },

  async refreshQr() {
    const r = await apiGetQr();
    return r.success && r.qrToken ? r.qrToken : null;
  },

  async scanQr(qrToken) {
    const r = await apiScan(qrToken);
    if (r.success) await get().refreshPartnerLoyalty();
    return r;
  },

  async redeemReward(qrToken) {
    const r = await apiRedeem(qrToken);
    if (r.success) await get().refreshPartnerLoyalty();
    return r;
  },

  async updatePartnerSettings(settings) {
    const r = await apiUpdatePartnerSettings(settings);
    if (!r.success || !r.partner) {
      return { ok: false as const, error: r.error || 'Mise à jour impossible.' };
    }
    // Reflect the update in the auth store too (user object has reward fields).
    useAuthStore.getState().setUser(r.partner);
    return { ok: true as const };
  },

  clear() {
    set({ clientLoyalty: [], partnerLoyalty: [] });
  },
}));
