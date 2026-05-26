import React from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLoyaltyStore } from '../stores/loyaltyStore';
import { usePartnersStore } from '../stores/partnersStore';

/**
 * Backwards-compatible facade over the Zustand stores.
 *
 * Reason this exists: the screens were originally written against a single
 * `useApp()` context. The store split (auth / loyalty / partners) is good
 * architecture, but rewriting 11 screens to use 3 separate hooks would be
 * a noisy diff. This facade re-exposes the same flat API on top of the
 * Zustand selectors, so each screen still calls `useApp()` and only
 * re-renders on the slice it actually reads.
 *
 * Selectors are intentionally narrow — e.g. `ready` reads only auth.ready.
 */

export function useApp() {
  // Auth slice
  const ready = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const signupClient = useAuthStore((s) => s.signupClient);
  const loginClient = useAuthStore((s) => s.loginClient);
  const signupPartner = useAuthStore((s) => s.signupPartner);
  const loginPartner = useAuthStore((s) => s.loginPartner);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);

  // Loyalty slice
  const clientLoyalty = useLoyaltyStore((s) => s.clientLoyalty);
  const partnerLoyalty = useLoyaltyStore((s) => s.partnerLoyalty);
  const refreshClientLoyalty = useLoyaltyStore((s) => s.refreshClientLoyalty);
  const refreshPartnerLoyalty = useLoyaltyStore((s) => s.refreshPartnerLoyalty);
  const refreshQr = useLoyaltyStore((s) => s.refreshQr);
  const scanQr = useLoyaltyStore((s) => s.scanQr);
  const redeemReward = useLoyaltyStore((s) => s.redeemReward);
  const updatePartnerSettings = useLoyaltyStore((s) => s.updatePartnerSettings);

  // Partners slice
  const partners = usePartnersStore((s) => s.partners);
  const refreshPartners = usePartnersStore((s) => s.refresh);

  return {
    ready,
    user,
    partners,
    clientLoyalty,
    partnerLoyalty,
    // actions
    signupClient,
    loginClient,
    signupPartner,
    loginPartner,
    logout,
    deleteAccount,
    refreshClientLoyalty,
    refreshPartnerLoyalty,
    refreshQr,
    scanQr,
    redeemReward,
    updatePartnerSettings,
    refreshPartners,
  };
}

// AppProvider is no-op now (stores are global). Kept for backwards
// compatibility in case someone still imports it.
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};
