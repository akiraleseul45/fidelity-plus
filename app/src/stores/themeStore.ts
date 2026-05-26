import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/**
 * Theme preference store.
 *
 * 'system' follows the device colour scheme; 'light'/'dark' force a mode.
 * Persisted across launches.
 */

type Preference = 'system' | 'light' | 'dark';
const KEY = 'fidl.theme.pref';

type ThemeState = {
  preference: Preference;
  setPreference: (p: Preference) => void;
  hydrate: () => Promise<void>;
};

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  setPreference(p) {
    set({ preference: p });
    AsyncStorage.setItem(KEY, p).catch(() => {});
  },
  async hydrate() {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      set({ preference: raw });
    }
  },
}));
