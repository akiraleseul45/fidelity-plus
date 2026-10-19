const {
  newId,
  newClientCode,
  newPartnerCode,
  newAdminCode,
  hashSecret,
  verifySecret,
  signAccessToken,
} = require('../lib/crypto');
const { DEFAULT_CATEGORY, DEFAULT_SERVICE_MODE } = require('../lib/business');
const driver = require('../db/driver');
const usersRepo = require('../repositories/users');
const clientsRepo = require('../repositories/clients');
const partnersRepo = require('../repositories/partners');
const sessionsRepo = require('../repositories/sessions');
const loginCodesRepo = require('../repositories/loginCodes');
const logger = require('../lib/logger');

/**
 * Auth service — async, driver-agnostic.
 *
 * Login codes are issued with guaranteed uniqueness via the
 * `login_code_lookup` PRIMARY KEY. Login is O(1).
 */

const MAX_CODE_RETRIES = 100;

/**
 * Inside a transaction, repeatedly generate codes until one is unique
 * (claim succeeds). Returns the accepted code.
 */
async function generateAndClaimCode(generate, userId, ctx) {
  for (let i = 0; i < MAX_CODE_RETRIES; i++) {
    const code = generate();
    const claimed = await loginCodesRepo.tryClaim(code, userId, ctx);
    if (claimed) return code;
  }
  logger.fatal({ userId }, 'login code space exhausted');
  throw new Error('Code space exhausted — operator action required.');
}

// ---------- Client signup ----------

async function signupClient({ pseudonym, email, consent }) {
  const userId = newId();
  let finalCode;
  await driver.transaction(async (ctx) => {
    const initialCode = newClientCode(); // placeholder hash so we can INSERT
    await ctx.mutate(
      `INSERT INTO users (id, role, email, login_code_hash, created_at, consent_given_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'client',
        email && email.trim() ? email.trim().toLowerCase() : null,
        hashSecret(initialCode),
        Date.now(),
        consent ? Date.now() : null,
      ],
    );
    await ctx.mutate(
      `INSERT INTO client_profiles (user_id, pseudonym, created_at) VALUES (?, ?, ?)`,
      [userId, pseudonym.trim(), Date.now()],
    );
    finalCode = await generateAndClaimCode(newClientCode, userId, ctx);
    await ctx.mutate(`UPDATE users SET login_code_hash = ? WHERE id = ?`, [
      hashSecret(finalCode),
      userId,
    ]);
  });
  return { userId, loginCode: finalCode };
}

// ---------- Partner signup ----------

async function signupPartner(input) {
  const userId = newId();
  let finalCode;
  await driver.transaction(async (ctx) => {
    const initialCode = newPartnerCode();
    await ctx.mutate(
      `INSERT INTO users (id, role, email, login_code_hash, created_at, consent_given_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        'partner',
        input.email.trim().toLowerCase(),
        hashSecret(initialCode),
        Date.now(),
        input.consent ? Date.now() : null,
      ],
    );
    await ctx.mutate(
      `INSERT INTO partner_profiles (
        user_id, owner_name, company_name, address, lat, lng,
        phone_fixed, phone_mobile, image_url, category, service_mode,
        reward_threshold, reward_type, reward_value,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        input.ownerName.trim(),
        input.companyName.trim(),
        input.address.trim(),
        input.lat ?? null,
        input.lng ?? null,
        input.phoneFixed?.trim() || null,
        input.phoneMobile?.trim() || null,
        input.imageUrl?.trim() || null,
        input.category || DEFAULT_CATEGORY,
        input.serviceMode || DEFAULT_SERVICE_MODE,
        10,
        'free_meal',
        null,
        'pending',
        Date.now(),
        Date.now(),
      ],
    );
    finalCode = await generateAndClaimCode(newPartnerCode, userId, ctx);
    await ctx.mutate(`UPDATE users SET login_code_hash = ? WHERE id = ?`, [
      hashSecret(finalCode),
      userId,
    ]);
  });
  return { userId, loginCode: finalCode };
}

// ---------- Recovery: rotate the client's code and return the new one ----------
//
// We can't resend the old code (it's only stored hashed/HMAC'd — audit FP-03).
// Recovery therefore ROTATES the code: a new unique code is generated, the old
// one stops working, and the caller emails the new code to the registered
// address. Returns null when no client account matches (the route still
// answers 200 to avoid enumeration).
async function rotateClientCodeByEmail({ email }) {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return null;
  const user = await usersRepo.byEmailAndRole(normalized, 'client');
  if (!user) return null;

  let finalCode;
  await driver.transaction(async (ctx) => {
    await loginCodesRepo.releaseAllForUser(user.id, ctx);
    finalCode = await generateAndClaimCode(newClientCode, user.id, ctx);
    await ctx.mutate(`UPDATE users SET login_code_hash = ? WHERE id = ?`, [
      hashSecret(finalCode),
      user.id,
    ]);
    // Any existing sessions keep working (the refresh token is independent of
    // the login code); the user can still revoke them by logging out.
  });

  const profile = await clientsRepo.full(user.id);
  return { userId: user.id, email: normalized, loginCode: finalCode, pseudonym: profile?.pseudonym };
}

// ---------- Login (O(1) lookup + constant-ish time) ----------

const DUMMY_HASH = hashSecret('dummy-for-timing-balance');

async function loginByCode({ code, role }) {
  const userId = await loginCodesRepo.findUserIdByCode(code);
  if (!userId) {
    verifySecret(code, DUMMY_HASH); // balance timing
    return null;
  }
  const user = await usersRepo.byId(userId);
  if (!user || user.role !== role) {
    verifySecret(code, DUMMY_HASH);
    return null;
  }
  if (user.locked_until && user.locked_until > Date.now()) {
    return null;
  }
  const hash = await usersRepo.loginCodeHashById(userId);
  if (!hash || !verifySecret(code, hash)) {
    await usersRepo.recordFailedAttempt(userId);
    return null;
  }
  await usersRepo.clearFailedAttempts(userId);
  // A deactivated account authenticates correctly but cannot proceed.
  if (user.suspended_at) {
    return { suspended: true };
  }
  return { userId };
}

// ---------- Admin provisioning + login ----------

// Create an admin account with a strong 12-char code. The plaintext code is
// returned ONCE (never stored) so the operator can save it. Uses the same
// hashed/HMAC'd storage as client/partner codes.
async function createAdmin({ email = null } = {}) {
  const userId = newId();
  let finalCode;
  await driver.transaction(async (ctx) => {
    const initialCode = newAdminCode();
    await ctx.mutate(
      `INSERT INTO users (id, role, email, login_code_hash, created_at, consent_given_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, 'admin', email ? email.trim().toLowerCase() : null, hashSecret(initialCode), Date.now(), Date.now()],
    );
    finalCode = await generateAndClaimCode(newAdminCode, userId, ctx);
    await ctx.mutate(`UPDATE users SET login_code_hash = ? WHERE id = ?`, [
      hashSecret(finalCode),
      userId,
    ]);
  });
  return { userId, loginCode: finalCode };
}

// ---------- Token issuance ----------

async function issueTokens({ userId, role, userAgent, ip }) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { sessionId, refreshToken } = await sessionsRepo.issue({ userId, userAgent, ip });
  return { accessToken, sessionId, refreshToken };
}

async function refresh({ sessionId, refreshToken, userAgent, ip }) {
  const r = await sessionsRepo.verifyAndRevoke({ sessionId, refreshToken });
  // Replay of an already-revoked token → likely theft: revoke the whole
  // family so neither the attacker nor the victim can keep refreshing (FP-19).
  if (r.status === 'reused') {
    await sessionsRepo.revokeAllForUser(r.userId);
    logger.warn({ userId: r.userId }, '[auth] refresh token replay detected — family revoked');
    return null;
  }
  // Benign concurrent rotation (lost the race), expired, or invalid.
  if (r.status !== 'ok') return null;
  const user = await usersRepo.byId(r.userId);
  if (!user) return null;
  const tokens = await issueTokens({ userId: r.userId, role: user.role, userAgent, ip });
  return { user, ...tokens };
}

async function logout(sessionId) {
  if (sessionId) await sessionsRepo.revoke(sessionId);
}

// ---------- Demo / simulation accounts (admin) ----------

async function getMeta(key) {
  const r = await driver.queryOne(`SELECT value FROM meta WHERE key = ?`, [key]);
  return r?.value || null;
}

// Ensure the demo account for a role exists (is_demo=1) and return its id.
// Demo accounts are excluded from the public directory, admin lists and stats.
async function getOrCreateDemo(role) {
  const r = role === 'partner' ? 'partner' : 'client';
  const metaKey = r === 'partner' ? 'demo_partner_id' : 'demo_client_id';

  const existingId = await getMeta(metaKey);
  if (existingId) {
    const u = await usersRepo.byId(existingId);
    if (u) return existingId; // still valid
  }

  const userId = newId();
  const unusable = hashSecret(newId() + newId()); // no login_code_lookup → not loginable
  await driver.transaction(async (ctx) => {
    if (r === 'partner') {
      await ctx.mutate(
        `INSERT INTO users (id, role, email, login_code_hash, created_at, is_demo)
         VALUES (?, 'partner', 'demo.partner@fidelity.local', ?, ?, 1)`,
        [userId, unusable, Date.now()],
      );
      await ctx.mutate(
        `INSERT INTO partner_profiles (
          user_id, owner_name, company_name, address, lat, lng,
          phone_fixed, phone_mobile, image_url, category, service_mode,
          reward_threshold, reward_type, reward_value, status, created_at, updated_at
        ) VALUES (?, 'Démo', 'Boutique Démo', '1 rue de la Démo, 45000 Orléans', 47.9, 1.9,
          NULL, NULL, NULL, 'restaurant', 'les_deux', 10, 'free_meal', NULL, 'approved', ?, ?)`,
        [userId, Date.now(), Date.now()],
      );
    } else {
      await ctx.mutate(
        `INSERT INTO users (id, role, email, login_code_hash, created_at, is_demo)
         VALUES (?, 'client', 'demo.client@fidelity.local', ?, ?, 1)`,
        [userId, unusable, Date.now()],
      );
      await ctx.mutate(
        `INSERT INTO client_profiles (user_id, pseudonym, created_at) VALUES (?, 'Client Démo', ?)`,
        [userId, Date.now()],
      );
    }
    await ctx.mutate(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value`,
      [metaKey, userId],
    );
  });
  return userId;
}

// Issue a long-lived (2h) access token for the demo account so an admin can
// test the app as a client/partner, then swap back. No refresh cookies are
// set, so the admin's own session is untouched.
async function impersonateDemo(role) {
  const r = role === 'partner' ? 'partner' : 'client';
  const userId = await getOrCreateDemo(r);
  const accessToken = signAccessToken({ sub: userId, role: r, demo: true }, '2h');
  let user;
  if (r === 'client') {
    const p = await clientsRepo.full(userId);
    user = { ...p, role: 'client' };
  } else {
    const p = await partnersRepo.byId(userId);
    user = { ...p, role: 'partner' };
  }
  return { accessToken, user };
}

module.exports = {
  signupClient,
  signupPartner,
  createAdmin,
  loginByCode,
  rotateClientCodeByEmail,
  issueTokens,
  refresh,
  logout,
  impersonateDemo,
};
