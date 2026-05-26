const express = require('express');
const driver = require('../db/driver');

const router = express.Router();

/**
 * GET /health
 *
 * Liveness + downstream checks. Returns 503 if any check fails.
 */
router.get('/', async (_req, res) => {
  const checks = {};
  try {
    await driver.queryOne('SELECT 1 AS ok');
    checks.db = 'up';
  } catch {
    checks.db = 'down';
  }

  const allUp = Object.values(checks).every((v) => v === 'up');
  res.status(allUp ? 200 : 503).json({
    ok: allUp,
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version || '1.0.0',
    driver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
    checks,
  });
});

module.exports = router;
