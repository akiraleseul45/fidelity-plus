import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin wrapper over AsyncStorage. All app persistence goes through here.
 *
 * Note: since the rewrite to backend-as-source-of-truth, AsyncStorage is
 * only used for the JWT bundle (see store/api.ts). All entity caches
 * (clients, partners, loyalty) live server-side.
 */

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  /** One-shot cleanup of legacy v1 keys (run at boot). */
  async wipeLegacy(): Promise<void> {
    const legacyKeys = [
      'fidl.clients',
      'fidl.currentClientId',
      'fidl.restaurants',
      'fidl.loyalty',
      'fidl.signupRequests',
      'fidl.currentRestoId', // legacy key kept here for backward-compat wipe
    ];
    await Promise.all(legacyKeys.map((k) => AsyncStorage.removeItem(k)));
  },
};
