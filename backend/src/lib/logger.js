const pino = require('pino');

/**
 * Structured logger — JSON in prod, pretty in dev.
 *
 * Levels: trace, debug, info, warn, error, fatal.
 *
 * Why pino: 5x faster than Winston, zero-cost when level is off, JSON
 * output is grep/jq-friendly + native compatibility with log aggregators
 * (Datadog, Logtail, Better Stack, etc).
 */

const isDev = process.env.NODE_ENV !== 'production';
const level = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

const logger = pino({
  level,
  base: { service: 'fidelity-plus-backend' },
  redact: {
    // Never log secrets even if accidentally passed in an object.
    paths: [
      'password',
      '*.password',
      'loginCode',
      '*.loginCode',
      'login_code_hash',
      '*.login_code_hash',
      'refreshToken',
      '*.refreshToken',
      'refresh_token_hash',
      'accessToken',
      '*.accessToken',
      'JWT_*',
      'SMTP_PASS',
      'authorization',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      },
    },
  }),
});

module.exports = logger;
