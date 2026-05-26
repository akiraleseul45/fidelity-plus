/**
 * Sentry init.
 *
 * No-op if SENTRY_DSN is not set (e.g. local dev). When you create a
 * Sentry project, paste the DSN into the .env and errors will start
 * flowing without further code changes.
 */

const Sentry = require('@sentry/node');
const logger = require('./logger');

const DSN = process.env.SENTRY_DSN;
const ENV = process.env.NODE_ENV || 'development';
const RELEASE = process.env.RELEASE || process.env.npm_package_version;

let initialised = false;

function initSentry() {
  if (!DSN) {
    logger.warn('[sentry] SENTRY_DSN not set — error reporting disabled.');
    return false;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
  initialised = true;
  logger.info(`[sentry] ✅ initialised (env=${ENV})`);
  return true;
}

function captureException(err, context = {}) {
  if (initialised) Sentry.captureException(err, { extra: context });
}

function captureMessage(msg, level = 'info') {
  if (initialised) Sentry.captureMessage(msg, level);
}

module.exports = { initSentry, captureException, captureMessage, Sentry };
