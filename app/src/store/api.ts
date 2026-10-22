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

// In production EXPO_PUBLIC_API_URL is the app's OWN origin
// (https://fidelity-plus.vercel.app). A vercel.json rewrite proxies /api/*
// to the Render backend, so the browser only ever talks to one origin and
// the auth cookie is first-party → the session persists on every browser,
// iOS/Safari included. Locally it falls back to the dev backend.
const ENV_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
function defaultBaseUrl(): string {
  if (ENV_URL) return ENV_URL.replace(/\/+$/, '');
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
export const API_BASE_URL = defaultBaseUrl();

// ---------- Token storage ----------

const TOKENS_KEY = 'fidl.tokens.v3'; // bumped from v2 to invalidate stale state

export type Tokens = {
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

// While an admin is simulating a demo account, we must NOT auto-refresh on
// 401 (refresh would use the admin's cookie and silently swap the session
// back). The admin's refresh cookie stays valid for the real return.
let impersonating = false;
export function setImpersonating(v: boolean) {
  impersonating = v;
}

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

    // On 401, attempt one refresh and retry (never while simulating).
    if (res.status === 401 && auth && !opts._retried && !impersonating) {
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
  | { id: string; role: 'admin'; email?: string | null }
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
      category?: string | null;
      serviceMode?: string | null;
      email?: string | null;
      rewardThreshold: number;
      rewardType: 'free_meal' | 'discount';
      rewardValue?: number | null;
      status: 'pending' | 'approved' | 'suspended';
      // The 3 toggleable axes. Returned as 0/1 integers from the backend —
      // read with `!!partner.modBooking`. Booking flavour + vitrine text too.
      modLoyalty?: number;
      modBooking?: number;
      modVitrine?: number;
      description?: string | null;
      bookingMode?: 'appointment' | 'table' | null;
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
  category?: string;
  serviceMode?: string;
  consent: boolean;
}): Promise<{ success: boolean; userId?: string; loginCode?: string; message?: string; error?: string }> {
  return fetchJson('/api/auth/partner/signup', {
    method: 'POST',
    body: JSON.stringify(body),
  }, { auth: false });
}

// ---------- Admin ----------

export async function apiAdminLogin(code: string): Promise<AuthResponse> {
  return fetchJson<AuthResponse>('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, { auth: false });
}

export type AdminPartner = {
  id: string;
  email: string | null;
  createdAt?: number;
  suspendedAt: number | null;
  ownerName: string;
  companyName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phoneFixed: string | null;
  phoneMobile: string | null;
  imageUrl: string | null;
  category: string | null;
  serviceMode: string | null;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue: number | null;
  status: 'pending' | 'approved' | 'suspended';
};

export type AdminClient = {
  id: string;
  email: string | null;
  pseudonym: string;
  createdAt: number;
  suspendedAt: number | null;
  totalPoints: number;
  partnersCount: number;
};

export async function apiAdminStats(): Promise<{
  success: boolean;
  stats?: { clients: number; partners: number; pendingPartners: number; openReports: number };
  error?: string;
}> {
  return fetchJson('/api/admin/stats', { method: 'GET' });
}

export async function apiAdminPartners(status?: string): Promise<{ success: boolean; items?: AdminPartner[]; error?: string }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return fetchJson(`/api/admin/partners${q}`, { method: 'GET' });
}

export async function apiAdminClients(): Promise<{ success: boolean; items?: AdminClient[]; error?: string }> {
  return fetchJson('/api/admin/clients', { method: 'GET' });
}

export async function apiAdminUpdatePartner(id: string, fields: Partial<Record<string, any>>): Promise<{ success: boolean; partner?: AdminPartner; error?: string }> {
  return fetchJson(`/api/admin/partners/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function apiAdminSetPartnerStatus(id: string, status: string): Promise<{ success: boolean; partner?: AdminPartner; error?: string }> {
  return fetchJson(`/api/admin/partners/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
}

export async function apiAdminSuspendPartner(id: string, suspended: boolean): Promise<{ success: boolean; partner?: AdminPartner; error?: string }> {
  return fetchJson(`/api/admin/partners/${id}/suspend`, { method: 'POST', body: JSON.stringify({ suspended }) });
}

export async function apiAdminDeletePartner(id: string): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/partners/${id}`, { method: 'DELETE' });
}

export async function apiAdminUpdateClient(id: string, fields: { pseudonym?: string; email?: string | null }): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/clients/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
}

export async function apiAdminSuspendClient(id: string, suspended: boolean): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/clients/${id}/suspend`, { method: 'POST', body: JSON.stringify({ suspended }) });
}

export async function apiAdminDeleteClient(id: string): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/clients/${id}`, { method: 'DELETE' });
}

// ---------- Reports ----------

export type AdminReport = {
  id: string;
  userId: string | null;
  role: string | null;
  message: string;
  context: string | null;
  status: 'open' | 'resolved';
  createdAt: number;
  resolvedAt: number | null;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterDeleted: number;
};

// A signed-in client/partner sends a problem report to the admin.
export async function apiCreateReport(message: string, context?: string): Promise<{ success: boolean; id?: string; message?: string; error?: string }> {
  return fetchJson('/api/reports', { method: 'POST', body: JSON.stringify({ message, context }) });
}

export async function apiAdminReports(status?: 'open' | 'resolved'): Promise<{ success: boolean; items?: AdminReport[]; error?: string }> {
  const q = status ? `?status=${status}` : '';
  return fetchJson(`/api/admin/reports${q}`, { method: 'GET' });
}

export async function apiAdminSetReportStatus(id: string, status: 'open' | 'resolved'): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export async function apiAdminDeleteReport(id: string): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/admin/reports/${id}`, { method: 'DELETE' });
}

// Open a demo client/partner session for the admin (returns a demo token).
export async function apiAdminImpersonate(role: 'client' | 'partner'): Promise<{ success: boolean; accessToken?: string; user?: AuthUser; error?: string }> {
  return fetchJson('/api/admin/impersonate', { method: 'POST', body: JSON.stringify({ role }) });
}

// ---------- Client history ----------

export type ClientHistoryItem = {
  id: string;
  delta: number;
  kind: 'add' | 'redeem';
  createdAt: number;
  companyName: string | null;
};

export async function apiClientHistory(): Promise<{ success: boolean; items?: ClientHistoryItem[]; error?: string }> {
  return fetchJson('/api/loyalty/history', { method: 'GET' });
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
  category: string | null;
  serviceMode: string | null;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue: number | null;
  status: string;
};

export async function apiPartners(filters?: {
  categories?: string[];
  serviceMode?: string;
}): Promise<{
  success: boolean;
  items?: PublicPartner[];
  error?: string;
}> {
  const params = new URLSearchParams();
  (filters?.categories || []).forEach((c) => params.append('category', c));
  if (filters?.serviceMode) params.set('serviceMode', filters.serviceMode);
  const qs = params.toString();
  return fetchJson(`/api/partners${qs ? `?${qs}` : ''}`, { method: 'GET' }, { auth: false });
}

// =====================================================================
//                         RESERVATION ENGINE
// No payment anywhere — prices (priceCents) are informative only.
// =====================================================================

// ---------- Shared types ----------

export type BookingMode = 'appointment' | 'table';

export type ProService = {
  id: string;
  partnerId: string;
  name: string;
  description: string | null;
  category: string | null;
  priceCents: number | null; // informative only
  currency: string;
  durationMin: number;
  capacity: number;
  imageUrl: string | null;
  isActive: number; // 0/1
  isPrivate: number; // 0/1
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

export type AvailabilityRule = { id?: string; weekday: number; startMin: number; endMin: number };

export type AvailabilityException = {
  id?: string;
  date: string; // YYYY-MM-DD
  isClosed: number; // 0/1
  startMin: number | null;
  endMin: number | null;
  reason: string | null;
};

export type BookingSettings = {
  partnerId?: string;
  slotIntervalMin: number;
  bufferMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  maxPerDay: number | null;
  defaultCapacity: number;
  timezone: string;
};

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'done' | 'no_show';

export type Booking = {
  id: string;
  reference: string;
  partnerId: string;
  serviceId: string | null;
  clientId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  partySize: number;
  startsAt: number;
  endsAt: number;
  status: BookingStatus;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  cancelledAt: number | null;
  serviceName?: string | null;
  partnerName?: string | null;
};

export type Slot = {
  time: string; // 'HH:MM'
  startMin: number;
  startsAt: number;
  endsAt: number;
  remaining: number;
};

export type VitrinePartner = {
  id: string;
  companyName: string;
  ownerName: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phoneFixed: string | null;
  phoneMobile: string | null;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  serviceMode: string | null;
  modLoyalty: boolean;
  modBooking: boolean;
  modVitrine: boolean;
  bookingMode: BookingMode;
  rewardThreshold: number;
  rewardType: 'free_meal' | 'discount';
  rewardValue: number | null;
};

// ---------- Pro management (authenticated partner) ----------

// Toggle the 3 axes / edit vitrine text / booking flavour / cover image.
export async function apiProUpdateProfile(fields: {
  modLoyalty?: boolean;
  modBooking?: boolean;
  modVitrine?: boolean;
  description?: string;
  bookingMode?: BookingMode;
  imageUrl?: string;
  category?: string;
  serviceMode?: string;
}): Promise<{ success: boolean; partner?: AuthUser; error?: string }> {
  return fetchJson('/api/pro/profile', { method: 'PUT', body: JSON.stringify(fields) });
}

export async function apiProServices(): Promise<{ success: boolean; items?: ProService[]; error?: string }> {
  return fetchJson('/api/pro/services', { method: 'GET' });
}

export async function apiProCreateService(body: {
  name: string;
  description?: string;
  category?: string;
  priceCents?: number | null;
  currency?: string;
  durationMin?: number;
  capacity?: number;
  imageUrl?: string;
  isActive?: boolean;
  isPrivate?: boolean;
  sortOrder?: number;
}): Promise<{ success: boolean; service?: ProService; error?: string }> {
  return fetchJson('/api/pro/services', { method: 'POST', body: JSON.stringify(body) });
}

export async function apiProUpdateService(
  id: string,
  fields: Partial<{
    name: string;
    description: string;
    category: string;
    priceCents: number | null;
    currency: string;
    durationMin: number;
    capacity: number;
    imageUrl: string;
    isActive: boolean;
    isPrivate: boolean;
    sortOrder: number;
  }>,
): Promise<{ success: boolean; service?: ProService; error?: string }> {
  return fetchJson(`/api/pro/services/${id}`, { method: 'PUT', body: JSON.stringify(fields) });
}

export async function apiProDeleteService(id: string): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/pro/services/${id}`, { method: 'DELETE' });
}

export async function apiProAvailability(): Promise<{
  success: boolean;
  rules?: AvailabilityRule[];
  exceptions?: AvailabilityException[];
  error?: string;
}> {
  return fetchJson('/api/pro/availability', { method: 'GET' });
}

export async function apiProSetRules(
  rules: AvailabilityRule[],
): Promise<{ success: boolean; rules?: AvailabilityRule[]; error?: string }> {
  return fetchJson('/api/pro/availability/rules', { method: 'PUT', body: JSON.stringify({ rules }) });
}

export async function apiProUpsertException(body: {
  date: string;
  isClosed?: boolean;
  startMin?: number;
  endMin?: number;
  reason?: string;
}): Promise<{ success: boolean; exception?: AvailabilityException; error?: string }> {
  return fetchJson('/api/pro/availability/exception', { method: 'PUT', body: JSON.stringify(body) });
}

export async function apiProDeleteException(date: string): Promise<{ success: boolean; error?: string }> {
  return fetchJson(`/api/pro/availability/exception/${date}`, { method: 'DELETE' });
}

export async function apiProBookingSettings(): Promise<{ success: boolean; settings?: BookingSettings; error?: string }> {
  return fetchJson('/api/pro/booking-settings', { method: 'GET' });
}

export async function apiProUpdateBookingSettings(
  fields: Partial<Omit<BookingSettings, 'partnerId'>>,
): Promise<{ success: boolean; settings?: BookingSettings; error?: string }> {
  return fetchJson('/api/pro/booking-settings', { method: 'PUT', body: JSON.stringify(fields) });
}

export async function apiProBookings(
  scope: 'upcoming' | 'past' | 'all' = 'upcoming',
): Promise<{ success: boolean; items?: Booking[]; error?: string }> {
  return fetchJson(`/api/pro/bookings?scope=${scope}`, { method: 'GET' });
}

export async function apiProSetBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ success: boolean; booking?: Booking; error?: string }> {
  return fetchJson(`/api/pro/bookings/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
}

// ---------- Public vitrine + booking (guest or client) ----------

export async function apiVitrine(partnerId: string): Promise<{
  success: boolean;
  partner?: VitrinePartner;
  services?: ProService[];
  bookingSettings?: { timezone: string; maxAdvanceDays: number } | null;
  error?: string;
}> {
  return fetchJson(`/api/booking/partner/${partnerId}`, { method: 'GET' }, { auth: false });
}

export async function apiSlots(
  partnerId: string,
  date: string,
  serviceId?: string,
): Promise<{
  success: boolean;
  date?: string;
  mode?: BookingMode;
  durationMin?: number;
  capacity?: number;
  slots?: Slot[];
  error?: string;
}> {
  const q = new URLSearchParams({ date });
  if (serviceId) q.set('serviceId', serviceId);
  // auth:true so a signed-in client's token rides along (optional on the server).
  return fetchJson(`/api/booking/partner/${partnerId}/slots?${q.toString()}`, { method: 'GET' });
}

export async function apiBook(
  partnerId: string,
  body: {
    serviceId?: string;
    date: string;
    startMin: number;
    partySize?: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    notes?: string;
    acceptTerms: boolean;
  },
): Promise<{ success: boolean; booking?: Booking; error?: string }> {
  return fetchJson(`/api/booking/partner/${partnerId}/book`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---------- Client: my reservations ----------

export async function apiMyBookings(): Promise<{ success: boolean; items?: Booking[]; error?: string }> {
  return fetchJson('/api/booking/me', { method: 'GET' });
}

export async function apiCancelBooking(id: string): Promise<{ success: boolean; booking?: Booking; error?: string }> {
  return fetchJson(`/api/booking/${id}/cancel`, { method: 'POST' });
}
