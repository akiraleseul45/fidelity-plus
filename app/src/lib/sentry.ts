import { Platform } from 'react-native';

/**
 * Sentry init — no-op if EXPO_PUBLIC_SENTRY_DSN is missing.
 *
 * We use @sentry/react on web (no React Native binding needed because
 * Expo Web is a regular React app). On native, callers can swap in
 * @sentry/react-native; for the current web-first deploy this is enough.
 */

const DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();
const ENV = process.env.EXPO_PUBLIC_ENV || 'development';
const RELEASE = process.env.EXPO_PUBLIC_RELEASE;

let initialised = false;
let SentryModule: any = null;

export function initSentry(): boolean {
  if (!DSN) {
    console.warn('[sentry] EXPO_PUBLIC_SENTRY_DSN not set — disabled');
    return false;
  }

  try {
    if (Platform.OS === 'web') {
      // Lazy require to avoid breaking native bundles that don't ship @sentry/react.

      SentryModule = require('@sentry/react');
      SentryModule.init({
        dsn: DSN,
        environment: ENV,
        release: RELEASE,
        tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
      });
      initialised = true;
      console.info(`[sentry] ✅ web init env=${ENV}`);
    } else {
      // Stub on native — caller can plug @sentry/react-native here later.
      console.info('[sentry] native init skipped (no DSN integration yet)');
    }
  } catch (err) {
    console.warn('[sentry] init failed:', (err as Error).message);
  }
  return initialised;
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!initialised || !SentryModule) return;
  try {
    SentryModule.captureException(err, { extra: context });
  } catch {
    /* ignore */
  }
}

export function captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!initialised || !SentryModule) return;
  try {
    SentryModule.captureMessage(msg, level);
  } catch {
    /* ignore */
  }
}

/**
 * Install global handlers for the browser:
 *  - window.onerror (uncaught throws)
 *  - window.onunhandledrejection (unhandled promise rejections)
 *
 * On native we'd hook into ErrorUtils; out of scope here.
 */
export function installGlobalHandlers() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const onError = (event: ErrorEvent) => {
    console.error('[global error]', event.error || event.message);
    captureException(event.error || new Error(event.message), {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
    });
  };
  const onUnhandled = (event: PromiseRejectionEvent) => {
    console.error('[unhandled rejection]', event.reason);
    captureException(event.reason, { source: 'unhandledrejection' });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandled);
}
