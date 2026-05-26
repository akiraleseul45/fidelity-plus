/**
 * Global test environment. Runs ONCE before all test files.
 *
 * - Points DB_PATH to a temp file per run (so production DB is never touched)
 * - Provides deterministic JWT secrets
 * - Silences the logger unless LOG_LEVEL is explicitly set
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fidl-test-'));
process.env.DB_PATH = path.join(TMP, 'test.sqlite');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.JWT_QR_SECRET = 'test-qr-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.CODE_HMAC_SECRET = 'test-hmac-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.ADMIN_EMAIL = 'admin@test.local';
