import { create } from 'zustand';

/**
 * Cookie notice (RGPD).
 *
 * The app only sets strictly necessary cookies (the session that keeps you
 * logged in), which are exempt from consent. There is no analytics or
 * advertising cookie, so the banner is informational only (audit A-15).
 *
 * Dismissal is stored in localStorage so the notice isn't shown again.
 */

const KEY = 'fidl.cookies.v1';

type CookieState = {
  decided: boolean;
  load: () => void;
  acknowledge: () => void;
};

export const useCookieStore = create<CookieState>((set) => ({
  decided: false,

  load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(KEY);
      if (raw && JSON.parse(raw).decided) set({ decided: true });
    } catch {
      /* ignore */
    }
  },

  acknowledge() {
    set({ decided: true });
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(KEY, JSON.stringify({ decided: true }));
      }
    } catch {
      /* ignore (private mode / blocked storage) */
    }
  },
}));
