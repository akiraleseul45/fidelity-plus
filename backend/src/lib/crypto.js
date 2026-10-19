/**
 * Crypto helpers — single source of truth for hashing, IDs and JWTs.
 *
 * We use Node's built-in `crypto.scrypt` for password hashing instead of
 * adding a `bcrypt` native dep. scrypt is memory-hard and recommended by
 * OWASP for password storage.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SCRYPT_N = 16384;       // CPU/memory cost (2^14)
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_QR_SECRET = process.env.JWT_QR_SECRET;
const CODE_HMAC_SECRET = process.env.CODE_HMAC_SECRET;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET || !JWT_QR_SECRET || !CODE_HMAC_SECRET) {
  console.error(
    '[crypto] ❌ Secrets missing in .env. Add JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ' +
      'JWT_QR_SECRET, CODE_HMAC_SECRET (long random strings).',
  );
}

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const QR_TTL_SECONDS = 60;                       // QR valid for 60s

// ---------- password / login_code hashing ----------

/**
 * Hash a secret (login_code, refresh token) with scrypt.
 * Format stored: "scrypt$<salt-hex>$<derived-key-hex>"
 */
function hashSecret(plain) {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verify a secret against its hash. Constant-time comparison.
 */
function verifySecret(plain, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, dkHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(dkHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length, { N: SCRYPT_N });
  return crypto.timingSafeEqual(actual, expected);
}

// ---------- HMAC for login code reverse-lookup ----------

/**
 * HMAC a login code with the server secret so we can index it for O(1)
 * lookup without storing the plaintext code anywhere.
 *
 * Properties:
 *  - deterministic: same code + same secret → same HMAC (indexable)
 *  - keyed: an attacker who steals the DB can't precompute rainbow tables
 *  - the secret is server-side only, never sent to clients
 *
 * Format: base64url, 256-bit output.
 */
function hmacCode(code) {
  if (!CODE_HMAC_SECRET) {
    throw new Error('CODE_HMAC_SECRET missing');
  }
  return crypto
    .createHmac('sha256', CODE_HMAC_SECRET)
    .update(String(code).trim())
    .digest('base64url');
}

// ---------- ID + nonce generators ----------

function newId() {
  return crypto.randomUUID();
}

function newNonce() {
  // 16 bytes base64url ~ 22 chars; unguessable.
  return crypto.randomBytes(16).toString('base64url');
}

function newRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// ---------- 5-digit / 8-char code generators ----------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion

function randomCode(len) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return out;
}

// Client codes are now 8 chars from a 32-symbol alphabet (~40 bits, ~1.1e12
// combinations) instead of 5 digits (90k) — audit FP-03. Existing 5-digit
// codes keep working (login accepts both formats); only new/rotated codes use
// the stronger form, so no migration is required.
function newClientCode() {
  return randomCode(8);
}

function newPartnerCode() {
  return randomCode(8);
}

// Admin codes are 12 chars from the 32-symbol alphabet (~60 bits) — much
// stronger than client/partner codes, since an admin can see and change
// everything. Still from the no-confusion alphabet so it stays typeable.
function newAdminCode() {
  return randomCode(12);
}

// ---------- JWT helpers ----------

function signAccessToken(payload) {
  return jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET);
  } catch {
    return null;
  }
}

function signQrToken(payload) {
  // QR tokens are short-lived (60s) and include a nonce.
  return jwt.sign(payload, JWT_QR_SECRET, { expiresIn: QR_TTL_SECONDS });
}

function verifyQrToken(token) {
  try {
    return jwt.verify(token, JWT_QR_SECRET);
  } catch (err) {
    return { _error: err.name === 'TokenExpiredError' ? 'expired' : 'invalid' };
  }
}

module.exports = {
  hashSecret,
  verifySecret,
  hmacCode,
  newId,
  newNonce,
  newRefreshToken,
  newClientCode,
  newPartnerCode,
  newAdminCode,
  signAccessToken,
  verifyAccessToken,
  signQrToken,
  verifyQrToken,
  REFRESH_TTL_MS,
  QR_TTL_SECONDS,
};
