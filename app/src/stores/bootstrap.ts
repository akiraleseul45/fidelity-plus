import { initSentry, installGlobalHandlers } from '../lib/sentry';
import { useAuthStore } from './authStore';
import { useLoyaltyStore } from './loyaltyStore';
import { usePartnersStore } from './partnersStore';
import { useThemeStore } from './themeStore';
import { storage } from '../store/storage';

/**
 * Centralised app bootstrap — wipes legacy storage keys, rehydrates the
 * session, and prefetches the data needed for the first paint.
 *
 * Called once from App.tsx before showing any UI.
 */
export async function bootstrapApp(): Promise<void> {
  // -1. Crash reporting — set up before anything else can throw.
  initSentry();
  installGlobalHandlers();

  // 0. Theme preference (no network, cheap to do first).
  await useThemeStore.getState().hydrate();

  // 1. Drop pre-v2 storage (the JSON-files era).
  await storage.wipeLegacy();

  // 2. Auth — sets the current user from cached tokens (if any).
  await useAuthStore.getState().bootstrap();

  // 3. Public partners directory — needed everywhere.
  await usePartnersStore.getState().refresh();

  // 4. Role-specific loyalty data.
  const user = useAuthStore.getState().user;
  if (user?.role === 'client') {
    await useLoyaltyStore.getState().refreshClientLoyalty();
  } else if (user?.role === 'partner') {
    await useLoyaltyStore.getState().refreshPartnerLoyalty();
  }
}
