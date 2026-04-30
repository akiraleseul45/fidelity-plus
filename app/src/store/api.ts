import { Platform } from 'react-native';

/**
 * Backend base URL.
 * - Web (Chrome) → localhost
 * - Android emulator → 10.0.2.2 maps to host machine
 * - iOS simulator → localhost works
 * - Physical device → set EXPO_PUBLIC_API_URL to your LAN IP, e.g. http://192.168.1.42:3000
 */
const ENV_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();

function defaultBaseUrl(): string {
  if (ENV_URL) return ENV_URL.replace(/\/+$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}

export const API_BASE_URL = defaultBaseUrl();

export type ProSignupBody = {
  ownerName: string;
  companyName: string;
  address: string;
  lat?: number;
  lng?: number;
  email: string;
  phoneFixed?: string;
  phoneMobile?: string;
  imageUrl?: string;
};

export type ProSignupResponse = {
  success: boolean;
  code?: string;
  message?: string;
  error?: string;
};

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs = 15000,
): Promise<T & { success: boolean; error?: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      return { success: false, error: data?.error ?? `Erreur serveur (${res.status}).` } as any;
    }
    return data;
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.name === 'AbortError'
          ? 'Le serveur ne répond pas (timeout).'
          : 'Impossible de joindre le serveur.',
    } as any;
  } finally {
    clearTimeout(timeout);
  }
}

export async function postProSignup(body: ProSignupBody): Promise<ProSignupResponse> {
  return fetchJson<ProSignupResponse>('/api/pro/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type RemoteRestaurant = {
  id: string;
  code: string;
  ownerName: string;
  companyName: string;
  address: string;
  lat?: number;
  lng?: number;
  phoneFixed?: string;
  phoneMobile?: string;
  email: string;
  imageUrl?: string;
  createdAt: number;
  status: string;
};

export type ProLoginResponse = {
  success: boolean;
  restaurant?: RemoteRestaurant;
  error?: string;
};

export async function postProLogin(code: string): Promise<ProLoginResponse> {
  return fetchJson<ProLoginResponse>('/api/pro/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export type ProListResponse = {
  success: boolean;
  restaurants?: RemoteRestaurant[];
  error?: string;
};

export async function getProRestaurants(): Promise<ProListResponse> {
  return fetchJson<ProListResponse>('/api/pro/restaurants', { method: 'GET' });
}

// ---------- Client (end-user) ----------

export type ClientRecord = {
  id: string;
  pseudonym: string;
  email?: string;
  loginCode: string;
};

export type ClientSignupResponse = {
  success: boolean;
  client?: ClientRecord;
  isNew?: boolean;
  error?: string;
};

export async function postClientSignup(body: {
  pseudonym: string;
  email?: string;
}): Promise<ClientSignupResponse> {
  return fetchJson<ClientSignupResponse>('/api/client/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export type ClientLoginResponse = {
  success: boolean;
  client?: ClientRecord;
  error?: string;
};

export async function postClientLogin(body: {
  code: string;
}): Promise<ClientLoginResponse> {
  return fetchJson<ClientLoginResponse>('/api/client/login', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
