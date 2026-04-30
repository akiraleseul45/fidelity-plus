import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

export const STORAGE_KEYS = {
  clients: 'fidl.clients',
  currentClientId: 'fidl.currentClientId',
  restaurants: 'fidl.restaurants',
  loyalty: 'fidl.loyalty',
  signupRequests: 'fidl.signupRequests',
  currentRestoId: 'fidl.currentRestoId',
} as const;
