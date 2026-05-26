/**
 * Fidelity Plus — backend HTTP entry point.
 *
 * Boot order matters:
 *   1. dotenv.config()        — env vars before anything reads them
 *   2. Sentry init            — must wrap the rest so it catches boot errors
 *   3. DB init                — schema runs before any repository import
 *   4. Express stack assembly
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');

const logger = require('./src/lib/logger');
const { initSentry, captureException, Sentry } = require('./src/lib/sentry');

// Sentry first — captures any boot-time exception.
initSentry();

const { verifyTransport } = require('./mailer');
require('./src/db/driver'); // initialise DB driver (sqlite or postgres) & run schema
const qrRepo = require('./src/repositories/qrNonces');

const authRoutes = require('./src/routes/auth');
const loyaltyRoutes = require('./src/routes/loyalty');
const partnerRoutes = require('./src/routes/partners');
const healthRoutes = require('./src/routes/health');

const PORT = process.env.PORT || 3000;
const app = express();

// ---------------------------------------------------------------------
// Security & request prep
// ---------------------------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy: false, // JSON API, no HTML
    crossOriginResourcePolicy: false,
  }),
);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').trim();
app.use(
  cors({
    origin: ALLOWED_ORIGINS
      ? ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
      : '*',
    // Required for httpOnly auth cookies on web. When credentials:true,
    // CORS does NOT accept origin:'*' — the browser rejects it. If you
    // enable cookie auth in prod, you MUST set ALLOWED_ORIGINS to a CSV
    // of explicit domains.
    credentials: !!ALLOWED_ORIGINS,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: '64kb' }));
app.set('trust proxy', 1);

// Structured request logging (pino-http auto-correlates req/res).
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        // Never log request body — may contain PII / secrets.
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// ---------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------

app.get('/', (_req, res) => res.json({ name: 'fidelity-plus-backend', status: 'ok' }));
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/partners', partnerRoutes);

// ---------------------------------------------------------------------
// Error handlers
// ---------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route inconnue.' });
});

// Express error handler — translates known errors to proper HTTP codes,
// reports the rest to Sentry. Never leaks stack traces to the client.
app.use((err, req, res, _next) => {
  // Body-parser: payload too large.
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Requête trop volumineuse.' });
  }
  // Body-parser: invalid JSON.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'JSON invalide.' });
  }
  // CORS rejection (origin not allowed).
  if (err && /CORS|Not allowed by CORS/.test(err.message || '')) {
    return res.status(403).json({ success: false, error: 'Origine non autorisée.' });
  }

  logger.error({ err, route: req.url }, 'unhandled error');
  captureException(err, { url: req.url, method: req.method });
  res.status(500).json({ success: false, error: 'Erreur interne.' });
});

// Capture truly unhandled stuff (promise rejections, uncaught).
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandledRejection');
  captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  captureException(err);
  // Give Sentry a chance to flush, then exit.
  setTimeout(() => process.exit(1), 1000);
});

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------

const server = app.listen(PORT, async () => {
  logger.info(`🚀 Fidelity Plus backend listening on http://localhost:${PORT}`);
  logger.info('   AUTH    /api/auth/{client,partner}/{signup,login}, /refresh, /logout, /me');
  logger.info('   LOYALTY /api/loyalty/{qr, scan, redeem, me, partner}');
  logger.info('   READ    /api/partners');
  logger.info('   META    /health  /');
  await verifyTransport();
  // Start the QR-nonce purge loop now that the server is up.
  qrRepo.startPurgeLoop();
});

// Graceful shutdown — let in-flight requests finish.
function shutdown(signal) {
  logger.info(`${signal} received, draining connections...`);
  server.close(() => {
    logger.info('HTTP server closed cleanly.');
    Sentry.close(2000).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
