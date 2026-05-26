const {
  newId,
  newClientCode,
  newPartnerCode,
  hashSecret,
  verifySecret,
  signAccessToken,
} = require('../lib/crypto');
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
        phone_fixed, phone_mobile, image_url,
        reward_threshold, reward_type, reward_value,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  return { userId };
}

// ---------- Token issuance ----------

async function issueTokens({ userId, role, userAgent, ip }) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { sessionId, refreshToken } = await sessionsRepo.issue({ userId, userAgent, ip });
  return { accessToken, sessionId, refreshToken };
}

async function refresh({ sessionId, refreshToken, userAgent, ip }) {
  const userId = await sessionsRepo.verifyRefreshToken({ sessionId, refreshToken });
  if (!userId) return null;
  const user = await usersRepo.byId(userId);
  if (!user) return null;
  await sessionsRepo.revoke(sessionId);
  const tokens = await issueTokens({ userId, role: user.role, userAgent, ip });
  return { user, ...tokens };
}

async function logout(sessionId) {
  if (sessionId) await sessionsRepo.revoke(sessionId);
}

module.exports = {
  signupClient,
  signupPartner,
  loginByCode,
  issueTokens,
  refresh,
  logout,
};
