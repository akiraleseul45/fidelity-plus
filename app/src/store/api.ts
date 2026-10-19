import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * HTTP client for the Fidelity Plus API.
 *
 * Auth model:
 *   - On login/signup the server issues { accessToken, sessionId, refreshToken }
 *   - On WEB: refreshToken + sessionId are sent as httpOnly cookies
 *             (set by the server, invisible to JS). Only the accessToken
 *             lives in memory. We never touch the cookies from JS — the
 *             browser handles them automatically when `credentials: 'include'`.
 *   - On NATIVE: there's no browser cookie jar, so the refresh credentials
 *             are returned in the JSON body and stored in AsyncStorage.
 *             (For real mobile builds, switch to expo-secure-store —
 *             AsyncStorage is OK on web because we never put refresh
 *             there anymore, only the access token.)
 *
 * `X-Client-Type: web` tells the server which mode to use.
 *
 * Concurrency: a single refresh promise is shared across in-flight 401s
 * so we never trigger 5 refreshes from 5 simultaneous requests.
 */

const IS_WEB = Platform.OS === 'web';

const ENV_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
function defaultBaseUrl(): string {
  if (ENV_URL) return ENV_URL.replace(/\/+$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
export const API_BASE_URL = defaultBaseUrl();

// ---------- Token storage ----------

const TOKENS_KEY = 'fidl.tokens.v3'; // bumped from v2 to invalidate stale state

type Tokens = {
  accessToken: string;
  /** Only present on native — web stores these in httpOnly cookies. */
  sessionId?: string;
  refreshToken?: string;
};

// On web: keep access in memory only (no XSS surface). The refresh+session
// live in httpOnly cookies the browser sends automatically.
// On native: persist everything in AsyncStorage (in a real RN app, swap
// AsyncStorage for expo-secure-store here).
let memoryTokens: Tokens | null = null;

export async function loadTokens(): Promise<Tokens | null> {
  if (memoryTokens) return memoryTokens;
  if (IS_WEB) {
    // No persistence on web — accessToken regenerated via the refresh cookie.
    return null;
  }
  const raw = await AsyncStorage.getItem(TOKENS_KEY);
  memoryTokens = raw ? JSON.parse(raw) : null;
  return memoryTokens;
}

export async function saveTokens(t: Tokens): Promise<void> {
  memoryTokens = t;
  if (!IS_WEB) {
    await AsyncStorage.setItem(TOKENS_KEY, JSON.stringify(t));
  }
}

export async function clearTokens(): Promise<void> {
  memoryTokens = null;
  if (!IS_WEB) {
    await AsyncStorage.removeItem(TOKENS_KEY);
  }
}

// ---------- Core fetch with auto-refresh ----------

type ApiResult<T = any> = { success: boolean; error?: string } & T;

let refreshing: Promise<Tokens | null> | null = null;

async function refreshTokens(): Promise<Tokens | null> {
  // On web, refresh is driven entirely by the browser cookie — no body needed.
  // On native, we must pass sessionId + refreshToken from storage.
  const current = await loadTokens();
  if (!IS_WEB && (!current || !current.refreshToken || !current.sessionId)) {
    return null;
  }
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (IS_WEB) headers['X-Client-Type'] = 'web';

      const body = IS_WEB
        ? undefined
        : JSON.stringify({
            sessionId: current!.sessionId,
            refreshToken: current!.refreshToken,
          });

      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers,
        body,
        credentials: IS_WEB ? 'include' : 'omit',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !data.accessToken) {
        await clearTokens();
        return null;
      }
      const next: Tokens = IS_WEB
        ? { accessToken: data.accessToken }
        : {
            accessToken: data.accessToken,
            sessionId: data.sessionId,
            refreshToken: data.refreshToken,
          };
      await saveTokens(next);
      return next;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function fetchJson<T = any>(
  path: string,
  init: RequestInit = {},
  opts: { auth?: boolean; timeoutMs?: number; _retried?: boolean } = {},
): Promise<ApiResult<T>> {
  const { auth = true, timeoutMs = 15000 } = opts;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (IS_WEB) headers['X-Client-Type'] = 'web';
    if (auth) {
      const tokens = await loadTokens();
      if (tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: ctrl.signal,
      // Send the auth cookie automatically on web; ignore on native.
      credentials: IS_WEB ? 'include' : 'omit',
    });

    // On 401, attempt one refresh and retry.
    if (res.status === 401 && auth && !opts._retried) {
      const newTokens = await refreshTokens();
      if (newTokens) {
        return fetchJson<T>(path, init, { ...opts, _retried: true });
      }
    }

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data?.error ?? `Erreur serveur (${res.status}).`,
      } as ApiResult<T>;
    }
    return data as ApiResult<T>;
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.name === 'AbortError'
          ? 'Le serveur ne répond pas (timeout).'
          : 'Impossible de joindre le serveur.',
    } as ApiResult<T>;
  } finally {
    clearTimeout(timeout);
  }
}

// =====================================================================
//                              API endpoints
// =====================================================================

// ---------- Types ----------

export type AuthUser =
  | { id: string; role: 'client'; pseudonym: string; email?: string | null }
  | {
      id: string;
      role: 'partner';
      ownerName: string;
      companyName: string;
      address: string;
      lat?: number | null;
      lng?: number | null;
      phoneFixed?: string | null;
      phoneMobile?: string | null;
      imageUrl?: string | null;
      email?: string | null;
      rewardThreshold: number;
      rewardType: 'free_meal' | 'discount';
      rewardValue?: number | null;
      status: 'pending' | 'approved' | 'suspended';
    };

export type AuthResponse = {
  success: boolean;
  user?: AuthUser;
  loginCode?: string;        // shown ONCE at signup, never again
  accessToken?: string;
  sessionId?: string;
  refreshToken?: string;
  error?: string;
};

// ---------- Auth ----------

export async function apiClientSignup(body: {
  pseudonym: string;
  email?: string;
  consent: boolean;
}): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/client/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  }, { auth: false });
}

export async function apiClientLogin(code: string): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/client/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, { auth: false });
}

// Recover a lost client code: the server rotates it and emails a new one
// (audit FP-03). Always resolves success to avoid account enumeration.
export async function apiClientRecover(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
  return fetchJson('/api/auth/client/recover', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, { auth: false });
}

export async function apiPartnerSignup(body: {
  ownerName: string;
  companyName: string;
  address: string;
  lat?: number;
  lng?: number;
  email: string;
  phoneFixed?: string;
  phoneMobile?: string;
  imageUrl?: string;
  consent: boolean;
}): Promise<{ success: boolean; userId?: string; loginCode?: string; message?: string; error?: string }> {
  return fetchJson('/api/auth/partner/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  }, { auth: false });
}

export async function apiPartnerLogin(code: string): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/partner/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, { auth: false });
}

export async function apiLogout(): Promise<void> {
  const tokens = await loadTokens();
  // Web: server reads sessionId from cookie automatically.
  // Native: send sessionId in body.
  const body = IS_WEB ? {} : { sessionId: tokens?.sessionId };
  await fetchJson('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await clearTokens();
}

export async function apiMe(): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  return fetchJson('/api/auth/me', { method: 'GET' });
}

export async function apiDeleteMe(): Promise<{ success: boolean; error?: string }> {
  return fetchJson('/api/auth/me', { method: 'DELETE' });
}

// ---------- Loyalty ----------

export async function apiGetQr(): Promise<{
  success: boolean;
  qrToken?: string;
  expiresInSeconds?: number;
  error?: string;
}> {
  return fetchJson('/api/loyalty/qr', { method: 'GET' });
}

export async function apiScan(qrToken: string): Promise<{
  success: boolean;
  points?: number;
  threshold?: number;
  reached?: boolean;
  pseudonym?: string;
  clientId?: string;
  error?: string;
}> {
  return fetchJson('/api/loyalty/scan', {
    method: 'POST',
    body: JSON.stringify({ qrToken }),
  });
}

// Redeem is gated by the client's live QR (audit FP-08): the partner scans
// the client's QR in "reward" mode, exactly like a scan.
export async function apiRedeem(qrToken: string): Promise<{
  success: boolean;
  points?: number;
  pseudonym?: string;
  clientId?: string;
  error?: string;
}> {
  return fetchJson('/api/loyalty/redeem', {
    method: 'POST',
    body: JSON.stringify({ qrToken }),
  });
}

export type ClientLoyaltyItem = {
  partnerId: string;
  points: number;
  lastScanAt: number | null;
  companyName: string;
  ownerName: string;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue: number | null;
};

export async function apiClientLoyalty(): Promise<{
  success: boolean;
  items?: ClientLoyaltyItem[];
  error?: string;
}> {
  return fetchJson('/api/loyalty/me', { method: 'GET' });
}

export type PartnerLoyaltyItem = {
  clientId: string;
  pseudonym: string;
  points: number;
  lastScanAt: number | null;
};

export async function apiPartnerLoyalty(): Promise<{
  success: boolean;
  items?: PartnerLoyaltyItem[];
  error?: string;
}> {
  return fetchJson('/api/loyalty/partner', { method: 'GET' });
}

export async function apiUpdatePartnerSettings(body: {
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue?: number;
}): Promise<{ success: boolean; partner?: AuthUser; error?: string }> {
  return fetchJson('/api/loyalty/partner/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ---------- Public partner list ----------

export type PublicPartner = {
  id: string;
  ownerName: string;
  companyName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phoneFixed: string;
  phoneMobile: string;
  imageUrl: string;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue: number | null;
  status: string;
};

export async function apiPartners(): Promise<{
  success: boolean;
  items?: PublicPartner[];
  error?: string;
}> {
  return fetchJson('/api/partners', { method: 'GET' }, { auth: false });
}
