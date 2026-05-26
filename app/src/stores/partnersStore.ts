import { create } from 'zustand';
import { PublicPartner, apiPartners } from '../store/api';

/**
 * Partners directory store — the public list of partners shown on the
 * client map + list.
 */

type PartnersState = {
  partners: PublicPartner[];
  loading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
};

export const usePartnersStore = create<PartnersState>((set) => ({
  partners: [],
  loading: false,
  error: null,

  async refresh() {
    set({ loading: true, error: null });
    try {
      const r = await apiPartners();
      if (r.success && r.items) {
        set({ partners: r.items, loading: false });
      } else {
        set({ loading: false, error: r.error ?? 'Impossible de charger les partenaires.' });
      }
    } catch (err: any) {
      set({ loading: false, error: err?.message ?? 'Erreur réseau.' });
    }
  },
}));
