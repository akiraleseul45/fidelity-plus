import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { Client, LoyaltyEntry, Restaurant, RewardType, SignupRequest } from '../types';
import { STORAGE_KEYS, storage } from './storage';
import {
  getProRestaurants,
  postClientLogin,
  postClientSignup,
  postProLogin,
  postProSignup,
  RemoteRestaurant,
} from './api';

const SEED_RESTAURANTS: Restaurant[] = [
  {
    id: 'r-demo-1',
    name: 'Kebab Saint-Michel',
    ownerName: 'Mehdi B.',
    address: '12 rue Bannier, 45000 Orléans',
    lat: 47.9035,
    lng: 1.9046,
    imageUrl: 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=800',
    phoneMobile: '06 12 34 56 78',
    loginCode: 'DEMO1234',
    rewardThreshold: 10,
    rewardType: 'free_meal',
  },
  {
    id: 'r-demo-2',
    name: 'Chez Karim',
    ownerName: 'Karim D.',
    address: '44 rue Jeanne d\'Arc, 45000 Orléans',
    lat: 47.9001,
    lng: 1.9105,
    imageUrl: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?w=800',
    phoneFixed: '02 38 12 34 56',
    loginCode: 'KARIM777',
    rewardThreshold: 8,
    rewardType: 'discount',
    rewardValue: 20,
  },
];

type AppState = {
  clients: Client[];
  currentClientId: string | null;
  restaurants: Restaurant[];
  loyalty: LoyaltyEntry[];
  signupRequests: SignupRequest[];
  currentRestoId: string | null;
  ready: boolean;
};

type AppActions = {
  signupClient: (
    pseudonym: string,
    email?: string,
  ) => Promise<{ ok: true; client: Client; isNew: boolean } | { ok: false; error: string }>;
  loginClient: (code: string) => Promise<Client | null>;
  logoutClient: () => Promise<void>;
  getPoints: (clientId: string, restaurantId: string) => number;
  addPoint: (clientId: string, restaurantId: string, pseudonym: string) => Promise<LoyaltyEntry>;
  redeemReward: (clientId: string, restaurantId: string) => Promise<void>;
  submitRestoSignup: (
    data: Omit<SignupRequest, 'id' | 'createdAt' | 'status'>,
  ) => Promise<{ code: string; emailSent: boolean; error?: string }>;
  loginResto: (code: string) => Promise<Restaurant | null>;
  logoutResto: () => Promise<void>;
  updateRestoSettings: (
    id: string,
    patch: { rewardThreshold: number; rewardType: RewardType; rewardValue?: number },
  ) => Promise<void>;
};

type AppValue = AppState & AppActions & { client: Client | null };

const AppContext = createContext<AppValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>({
    clients: [],
    currentClientId: null,
    restaurants: [],
    loyalty: [],
    signupRequests: [],
    currentRestoId: null,
    ready: false,
  });

  useEffect(() => {
    (async () => {
      const [clients, currentClientId, restaurants, loyalty, signups, currentRestoId] = await Promise.all([
        storage.get<Client[]>(STORAGE_KEYS.clients),
        storage.get<string>(STORAGE_KEYS.currentClientId),
        storage.get<Restaurant[]>(STORAGE_KEYS.restaurants),
        storage.get<LoyaltyEntry[]>(STORAGE_KEYS.loyalty),
        storage.get<SignupRequest[]>(STORAGE_KEYS.signupRequests),
        storage.get<string>(STORAGE_KEYS.currentRestoId),
      ]);
      const resto = restaurants && restaurants.length > 0 ? restaurants : SEED_RESTAURANTS;
      if (!restaurants) await storage.set(STORAGE_KEYS.restaurants, resto);
      setState({
        clients: clients ?? [],
        currentClientId: currentClientId ?? null,
        restaurants: resto,
        loyalty: loyalty ?? [],
        signupRequests: signups ?? [],
        currentRestoId: currentRestoId ?? null,
        ready: true,
      });

      // Auto-sync registered pros from the backend so codes generated on
      // another device / session are recognized here too.
      try {
        const remote = await getProRestaurants();
        if (remote.success && remote.restaurants && remote.restaurants.length > 0) {
          const merged = mergeRemoteRestaurants(resto, remote.restaurants);
          if (merged !== resto) {
            await storage.set(STORAGE_KEYS.restaurants, merged);
            setState((s) => ({ ...s, restaurants: merged }));
            console.log(`[sync] merged ${remote.restaurants.length} pro accounts from backend`);
          }
        }
      } catch (err) {
        console.warn('[sync] backend unreachable, using local restaurants only');
      }
    })();
  }, []);

  const signupClient = useCallback(
    async (pseudonym: string, email?: string) => {
      // Try the backend first (so the code is recognized everywhere and the
      // welcome email goes out). If the server is unreachable, fall back to
      // a locally-generated code so the user can still use the app offline.
      const cleanedPseudo = pseudonym.trim();
      const cleanedEmail = email?.trim() || undefined;
      const res = await postClientSignup({
        pseudonym: cleanedPseudo,
        email: cleanedEmail,
      });

      let c: Client;
      if (res.success && res.client) {
        c = {
          id: res.client.id,
          pseudonym: res.client.pseudonym,
          email: res.client.email,
          loginCode: res.client.loginCode,
        };
        console.log(`[signup] backend OK — code ${c.loginCode}`);
      } else {
        const code = generate5DigitCode(state.clients.map((x) => x.loginCode));
        c = {
          id: Crypto.randomUUID(),
          pseudonym: cleanedPseudo,
          email: cleanedEmail,
          loginCode: code,
        };
        console.warn(
          `[signup] backend unreachable (${res.error}) — using local code ${code}`,
        );
      }

      const others = state.clients.filter((x) => x.id !== c.id);
      const clients = [...others, c];
      await storage.set(STORAGE_KEYS.clients, clients);
      await storage.set(STORAGE_KEYS.currentClientId, c.id);
      setState((s) => ({ ...s, clients, currentClientId: c.id }));

      return { ok: true as const, client: c, isNew: true };
    },
    [state.clients],
  );

  const loginClient = useCallback(
    async (code: string): Promise<Client | null> => {
      const normalized = code.trim();

      // 1. Local cache (fast path).
      const local = state.clients.find((c) => c.loginCode === normalized);
      if (local) {
        await storage.set(STORAGE_KEYS.currentClientId, local.id);
        setState((s) => ({ ...s, currentClientId: local.id }));
        return local;
      }

      // 2. Backend lookup — code may have been issued on another device.
      const res = await postClientLogin({ code: normalized });
      if (!res.success || !res.client) return null;

      const c: Client = {
        id: res.client.id,
        pseudonym: res.client.pseudonym,
        email: res.client.email,
        loginCode: res.client.loginCode,
      };
      const others = state.clients.filter((x) => x.id !== c.id);
      const clients = [...others, c];
      await storage.set(STORAGE_KEYS.clients, clients);
      await storage.set(STORAGE_KEYS.currentClientId, c.id);
      setState((s) => ({ ...s, clients, currentClientId: c.id }));
      return c;
    },
    [state.clients],
  );

  const logoutClient = useCallback(async () => {
    await storage.remove(STORAGE_KEYS.currentClientId);
    setState((s) => ({ ...s, currentClientId: null }));
  }, []);

  const getPoints = useCallback(
    (clientId: string, restaurantId: string) => {
      const entry = state.loyalty.find((e) => e.clientId === clientId && e.restaurantId === restaurantId);
      return entry?.points ?? 0;
    },
    [state.loyalty],
  );

  const addPoint = useCallback(
    async (clientId: string, restaurantId: string, pseudonym: string) => {
      let updated: LoyaltyEntry | null = null;
      const next = [...state.loyalty];
      const idx = next.findIndex((e) => e.clientId === clientId && e.restaurantId === restaurantId);
      if (idx >= 0) {
        next[idx] = { ...next[idx], points: next[idx].points + 1, pseudonym };
        updated = next[idx];
      } else {
        updated = { clientId, restaurantId, pseudonym, points: 1 };
        next.push(updated);
      }
      await storage.set(STORAGE_KEYS.loyalty, next);
      setState((s) => ({ ...s, loyalty: next }));
      return updated;
    },
    [state.loyalty],
  );

  const redeemReward = useCallback(
    async (clientId: string, restaurantId: string) => {
      const resto = state.restaurants.find((r) => r.id === restaurantId);
      if (!resto) return;
      const next = state.loyalty.map((e) =>
        e.clientId === clientId && e.restaurantId === restaurantId
          ? { ...e, points: Math.max(0, e.points - resto.rewardThreshold) }
          : e,
      );
      await storage.set(STORAGE_KEYS.loyalty, next);
      setState((s) => ({ ...s, loyalty: next }));
    },
    [state.restaurants, state.loyalty],
  );

  const submitRestoSignup = useCallback(
    async (data: Omit<SignupRequest, 'id' | 'createdAt' | 'status'>) => {
      // Try the backend first — it's the path that actually sends the email.
      const apiResult = await postProSignup({
        ownerName: data.ownerName,
        companyName: data.companyName,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        email: data.email,
        phoneFixed: data.phoneFixed,
        phoneMobile: data.phoneMobile,
        imageUrl: data.imageUrl,
      });

      // The signup ALWAYS succeeds locally (so the user is never blocked).
      // We just track whether the email was actually sent so the UI can
      // tell the truth on the success screen.
      const emailSent = !!(apiResult.success && apiResult.code);
      const code = emailSent && apiResult.code ? apiResult.code : generateRestoCode();
      const apiError = emailSent ? undefined : apiResult.error;

      if (emailSent) {
        console.log(`[signup] backend OK — code ${code} emailed to ${data.email}`);
      } else {
        console.warn(
          `[signup] backend unavailable (${apiResult.error}) — using local code ${code}`,
        );
      }

      // Persist the request locally for history.
      const req: SignupRequest = {
        id: Crypto.randomUUID(),
        createdAt: Date.now(),
        status: 'pending',
        ...data,
      };
      const signups = [req, ...state.signupRequests];
      await storage.set(STORAGE_KEYS.signupRequests, signups);

      // Auto-create the restaurant so the pro can log in immediately.
      const lat =
        typeof data.lat === 'number' && Number.isFinite(data.lat)
          ? data.lat
          : 47.9027 + (Math.random() - 0.5) * 0.02;
      const lng =
        typeof data.lng === 'number' && Number.isFinite(data.lng)
          ? data.lng
          : 1.909 + (Math.random() - 0.5) * 0.02;
      const resto: Restaurant = {
        id: Crypto.randomUUID(),
        name: data.companyName,
        ownerName: data.ownerName,
        address: data.address,
        lat,
        lng,
        imageUrl:
          data.imageUrl ||
          'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
        phoneFixed: data.phoneFixed,
        phoneMobile: data.phoneMobile,
        loginCode: code,
        rewardThreshold: 10,
        rewardType: 'free_meal',
      };
      const restaurants = [...state.restaurants, resto];
      await storage.set(STORAGE_KEYS.restaurants, restaurants);

      setState((s) => ({ ...s, signupRequests: signups, restaurants }));
      return { code, emailSent, error: apiError };
    },
    [state.signupRequests, state.restaurants],
  );

  const loginResto = useCallback(
    async (code: string): Promise<Restaurant | null> => {
      const normalized = code.trim().toUpperCase();

      // 1. Try local first (fast path: seeds + previously synced accounts).
      const local = state.restaurants.find((r) => r.loginCode.toUpperCase() === normalized);
      if (local) {
        await storage.set(STORAGE_KEYS.currentRestoId, local.id);
        setState((s) => ({ ...s, currentRestoId: local.id }));
        return local;
      }

      // 2. Ask backend — code may have been issued on another device.
      const remote = await postProLogin(normalized);
      if (!remote.success || !remote.restaurant) return null;

      const newResto: Restaurant = remoteToRestaurant(remote.restaurant);
      const restaurants = [...state.restaurants, newResto];
      await storage.set(STORAGE_KEYS.restaurants, restaurants);
      await storage.set(STORAGE_KEYS.currentRestoId, newResto.id);
      setState((s) => ({ ...s, restaurants, currentRestoId: newResto.id }));
      return newResto;
    },
    [state.restaurants],
  );

  const logoutResto = useCallback(async () => {
    await storage.remove(STORAGE_KEYS.currentRestoId);
    setState((s) => ({ ...s, currentRestoId: null }));
  }, []);

  const updateRestoSettings = useCallback(
    async (id: string, patch: { rewardThreshold: number; rewardType: RewardType; rewardValue?: number }) => {
      const next = state.restaurants.map((r) => (r.id === id ? { ...r, ...patch } : r));
      await storage.set(STORAGE_KEYS.restaurants, next);
      setState((s) => ({ ...s, restaurants: next }));
    },
    [state.restaurants],
  );

  const client = useMemo(
    () => state.clients.find((c) => c.id === state.currentClientId) ?? null,
    [state.clients, state.currentClientId],
  );

  const value = useMemo<AppValue>(
    () => ({
      ...state,
      client,
      signupClient,
      loginClient,
      logoutClient,
      getPoints,
      addPoint,
      redeemReward,
      submitRestoSignup,
      loginResto,
      logoutResto,
      updateRestoSettings,
    }),
    [
      state,
      client,
      signupClient,
      loginClient,
      logoutClient,
      getPoints,
      addPoint,
      redeemReward,
      submitRestoSignup,
      loginResto,
      logoutResto,
      updateRestoSettings,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};

function generate5DigitCode(taken: string[]): string {
  const used = new Set(taken);
  for (let i = 0; i < 50; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    if (!used.has(code)) return code;
  }
  return String(10000 + state_counter_fallback());
}

let _c = 0;
function state_counter_fallback() {
  _c = (_c + 1) % 90000;
  return _c;
}

function generateRestoCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function remoteToRestaurant(r: RemoteRestaurant): Restaurant {
  // Prefer the real geocoded lat/lng. Fall back to a deterministic
  // pseudo-coord around Orléans only when the backend has none (legacy data).
  const hasCoords =
    typeof r.lat === 'number' && Number.isFinite(r.lat) &&
    typeof r.lng === 'number' && Number.isFinite(r.lng);
  let lat: number;
  let lng: number;
  if (hasCoords) {
    lat = r.lat as number;
    lng = r.lng as number;
  } else {
    const seed = hashString(r.id);
    const dx = (((seed & 0xffff) / 0xffff) - 0.5) * 0.04;
    const dy = ((((seed >> 16) & 0xffff) / 0xffff) - 0.5) * 0.04;
    lat = 47.9027 + dy;
    lng = 1.909 + dx;
  }
  return {
    id: r.id,
    name: r.companyName,
    ownerName: r.ownerName || undefined,
    address: r.address || '',
    lat,
    lng,
    imageUrl:
      r.imageUrl || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    phoneFixed: r.phoneFixed || undefined,
    phoneMobile: r.phoneMobile || undefined,
    loginCode: r.code,
    rewardThreshold: 10,
    rewardType: 'free_meal',
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Merge backend-known pro accounts into the local list, preserving any
 * local-only customisations (rewardThreshold, address, etc.) and seed demos.
 * Match priority: same loginCode wins; otherwise append.
 */
function mergeRemoteRestaurants(local: Restaurant[], remote: RemoteRestaurant[]): Restaurant[] {
  const byCode = new Map(local.map((r) => [r.loginCode.toUpperCase(), r]));
  let changed = false;
  for (const r of remote) {
    const key = r.code.toUpperCase();
    if (!byCode.has(key)) {
      byCode.set(key, remoteToRestaurant(r));
      changed = true;
    }
  }
  if (!changed) return local;
  // Keep local order, then append the new ones at the end.
  const knownIds = new Set(local.map((r) => r.id));
  const out = [...local];
  for (const [, resto] of byCode) {
    if (!knownIds.has(resto.id) && !local.some((l) => l.loginCode.toUpperCase() === resto.loginCode.toUpperCase())) {
      out.push(resto);
    }
  }
  return out;
}
