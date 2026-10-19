import { create } from 'zustand';

/**
 * Cookie/consent preferences (RGPD).
 *
 * Two categories:
 *  - essential: always on (session cookie that keeps you logged in).
 *  - analytics: optional, OFF by default until the user opts in.
 *
 * The choice is stored in localStorage so the banner isn't shown again.
 * Essential cookies never depend on this — they are required to use the app.
 */

const KEY = 'fidl.cookies.v1';

type CookieState = {
  decided: boolean;
  analytics: boolean;
  load: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  setAnalytics: (v: boolean) => void;
};

function persist(decided: boolean, analytics: boolean) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify({ decided, analytics }));
    }
  } catch {
    /* ignore (private mode / blocked storage) */
  }
}

export const useCookieStore = create<CookieState>((set) => ({
  decided: false,
  analytics: false,

  load() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        set({ decided: !!d.decided, analytics: !!d.analytics });
      }
    } catch {
      /* ignore */
    }
  },

  acceptAll() {
    set({ decided: true, analytics: true });
    persist(true, true);
  },
  rejectOptional() {
    set({ decided: true, analytics: false });
    persist(true, false);
  },
  setAnalytics(v) {
    set({ decided: true, analytics: v });
    persist(true, v);
  },
}));
