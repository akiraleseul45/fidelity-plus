import { create } from 'zustand';
import {
  AuthUser,
  apiAdminLogin,
  apiClientLogin,
  apiClientSignup,
  apiDeleteMe,
  apiLogout,
  apiMe,
  apiPartnerLogin,
  apiPartnerSignup,
  clearTokens,
  loadTokens,
  saveTokens,
} from '../store/api';
import { useLoyaltyStore } from './loyaltyStore';

/**
 * Auth store — owns the current user, login/signup/logout actions.
 *
 * Kept narrow on purpose: no loyalty state here. The loyalty store
 * subscribes to user changes via selectors when needed.
 */

type AuthState = {
  ready: boolean;
  user: AuthUser | null;

  bootstrap: () => Promise<void>;

  signupClient: (pseudonym: string, email?: string) => Promise<
    { ok: true; user: AuthUser; loginCode: string } | { ok: false; error: string }
  >;
  loginClient: (code: string) => Promise<
    { ok: true; user: AuthUser } | { ok: false; error: string }
  >;
  signupPartner: (data: {
    ownerName: string;
    companyName: string;
    address: string;
    lat?: number;
    lng?: number;
    email: string;
    phoneFixed?: string;
    phoneMobile?: string;
    imageUrl?: string;
    category?: string;
    serviceMode?: string;
  }) => Promise<{ ok: true; loginCode: string } | { ok: false; error: string }>;
  loginPartner: (code: string) => Promise<
    { ok: true; user: AuthUser } | { ok: false; error: string }
  >;
  loginAdmin: (code: string) => Promise<
    { ok: true; user: AuthUser } | { ok: false; error: string }
  >;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; error: string }>;
  setUser: (user: AuthUser | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  ready: false,
  user: null,

  async bootstrap() {
    // On web, the session cookie may still be valid even without tokens
    // in memory. Try /me which will either succeed (cookie session refresh)
    // or 401 (no cookie / expired). On native, only attempt if we have
    // persisted tokens.
    const tokens = await loadTokens();
    let user: AuthUser | null = null;
    const shouldTry = !!tokens || typeof document !== 'undefined';
    if (shouldTry) {
      const me = await apiMe();
      if (me.success && me.user) user = me.user;
      else await clearTokens();
    }
    set({ user, ready: true });
  },

  async signupClient(pseudonym, email) {
    const res = await apiClientSignup({ pseudonym, email, consent: true });
    if (!res.success || !res.user || !res.loginCode) {
      return { ok: false as const, error: res.error || 'Inscription impossible.' };
    }
    if (res.accessToken) {
      // Web: only accessToken is returned (refresh lives in httpOnly cookie).
      // Native: sessionId + refreshToken come in the body.
      await saveTokens({
        accessToken: res.accessToken,
        sessionId: res.sessionId,
        refreshToken: res.refreshToken,
      });
    }
    set({ user: res.user });
    return { ok: true as const, user: res.user, loginCode: res.loginCode };
  },

  async loginClient(code) {
    const res = await apiClientLogin(code);
    if (!res.success || !res.user) {
      return { ok: false as const, error: res.error || 'Code invalide.' };
    }
    if (res.accessToken) {
      // Web: only accessToken is returned (refresh lives in httpOnly cookie).
      // Native: sessionId + refreshToken come in the body.
      await saveTokens({
        accessToken: res.accessToken,
        sessionId: res.sessionId,
        refreshToken: res.refreshToken,
      });
    }
    set({ user: res.user });
    return { ok: true as const, user: res.user };
  },

  async signupPartner(data) {
    const res = await apiPartnerSignup({ ...data, consent: true });
    if (!res.success || !res.loginCode) {
      return { ok: false as const, error: res.error || 'Inscription impossible.' };
    }
    return { ok: true as const, loginCode: res.loginCode };
  },

  async loginPartner(code) {
    const res = await apiPartnerLogin(code);
    if (!res.success || !res.user) {
      return { ok: false as const, error: res.error || 'Code invalide.' };
    }
    if (res.accessToken) {
      // Web: only accessToken is returned (refresh lives in httpOnly cookie).
      // Native: sessionId + refreshToken come in the body.
      await saveTokens({
        accessToken: res.accessToken,
        sessionId: res.sessionId,
        refreshToken: res.refreshToken,
      });
    }
    set({ user: res.user });
    return { ok: true as const, user: res.user };
  },

  async loginAdmin(code) {
    const res = await apiAdminLogin(code);
    if (!res.success || !res.user) {
      return { ok: false as const, error: res.error || 'Code invalide.' };
    }
    if (res.accessToken) {
      await saveTokens({
        accessToken: res.accessToken,
        sessionId: res.sessionId,
        refreshToken: res.refreshToken,
      });
    }
    set({ user: res.user });
    return { ok: true as const, user: res.user };
  },

  async logout() {
    await apiLogout();
    // Wipe the previous user's loyalty data so it can't leak into the next
    // session on this device (audit FP-22).
    useLoyaltyStore.getState().clear();
    set({ user: null });
  },

  async deleteAccount() {
    const res = await apiDeleteMe();
    if (!res.success) return { ok: false as const, error: res.error || 'Suppression impossible.' };
    await clearTokens();
    useLoyaltyStore.getState().clear();
    set({ user: null });
    return { ok: true as const };
  },

  setUser(user) {
    set({ user });
  },
}));
