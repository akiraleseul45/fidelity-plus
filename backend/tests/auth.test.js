/**
 * Auth service tests — covers signup, login, lockout, refresh rotation.
 * All async after the M-4 driver migration.
 */

const authService = require('../src/services/auth');
const usersRepo = require('../src/repositories/users');
const clientsRepo = require('../src/repositories/clients');

describe('authService — client signup & login', () => {
  test('signupClient stores a hashed code and returns the plain code once', async () => {
    const { userId, loginCode } = await authService.signupClient({
      pseudonym: 'Alice',
      email: 'alice@test.local',
      consent: true,
    });
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(loginCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/); // new 8-char client code (FP-03)
    const profile = await clientsRepo.full(userId);
    expect(profile.pseudonym).toBe('Alice');
    expect(profile.email).toBe('alice@test.local');
  });

  test('loginByCode succeeds with correct code', async () => {
    const { loginCode } = await authService.signupClient({ pseudonym: 'Bob' });
    const r = await authService.loginByCode({ code: loginCode, role: 'client' });
    expect(r).not.toBeNull();
    expect(r.userId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('loginByCode fails with wrong code', async () => {
    await authService.signupClient({ pseudonym: 'Carol' });
    const r = await authService.loginByCode({ code: '00000', role: 'client' });
    expect(r).toBeNull();
  });

  test('legacy 5-digit codes still log in (FP-03 back-compat)', async () => {
    const driver = require('../src/db/driver');
    const { newId, hashSecret, hmacCode } = require('../src/lib/crypto');
    const id = newId();
    const code = '12345';
    await driver.mutate(
      `INSERT INTO users (id, role, email, login_code_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
      [id, 'client', null, hashSecret(code), Date.now()],
    );
    await driver.mutate(
      `INSERT INTO client_profiles (user_id, pseudonym, created_at) VALUES (?, ?, ?)`,
      [id, 'LegacyUser', Date.now()],
    );
    await driver.mutate(
      `INSERT INTO login_code_lookup (code_hmac, user_id) VALUES (?, ?)`,
      [hmacCode(code), id],
    );
    const r = await authService.loginByCode({ code: '12345', role: 'client' });
    expect(r).toEqual({ userId: id });
  });

  test('recovery rotates the code: old fails, new works, account preserved (FP-03)', async () => {
    const { userId, loginCode } = await authService.signupClient({
      pseudonym: 'Rec',
      email: 'rec@test.local',
      consent: true,
    });
    expect(await authService.loginByCode({ code: loginCode, role: 'client' })).toEqual({ userId });
    const res = await authService.rotateClientCodeByEmail({ email: 'rec@test.local' });
    expect(res.userId).toBe(userId);
    expect(res.loginCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(res.loginCode).not.toBe(loginCode);
    expect(await authService.loginByCode({ code: loginCode, role: 'client' })).toBeNull();
    expect(await authService.loginByCode({ code: res.loginCode, role: 'client' })).toEqual({ userId });
  });

  test('recovery for an unknown email returns null (no enumeration)', async () => {
    const res = await authService.rotateClientCodeByEmail({ email: 'nobody-xyz@test.local' });
    expect(res).toBeNull();
  });

  test('issueTokens returns access + refresh', async () => {
    const { userId } = await authService.signupClient({ pseudonym: 'Dan' });
    const tokens = await authService.issueTokens({
      userId,
      role: 'client',
      userAgent: 'jest',
      ip: '127.0.0.1',
    });
    expect(tokens.accessToken).toMatch(/^eyJ/);
    expect(tokens.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokens.refreshToken.length).toBeGreaterThan(20);
  });

  test('refresh rotates the session (old refresh becomes invalid)', async () => {
    const { userId } = await authService.signupClient({ pseudonym: 'Eve' });
    const t1 = await authService.issueTokens({ userId, role: 'client' });
    const t2 = await authService.refresh({
      sessionId: t1.sessionId,
      refreshToken: t1.refreshToken,
    });
    expect(t2).not.toBeNull();
    expect(t2.sessionId).not.toBe(t1.sessionId);
    const t3 = await authService.refresh({
      sessionId: t1.sessionId,
      refreshToken: t1.refreshToken,
    });
    expect(t3).toBeNull();
  });

  test('two concurrent refreshes with the same token → only one succeeds (FP-19)', async () => {
    const { userId } = await authService.signupClient({ pseudonym: 'RaceRefresh' });
    const t1 = await authService.issueTokens({ userId, role: 'client' });
    const [a, b] = await Promise.all([
      authService.refresh({ sessionId: t1.sessionId, refreshToken: t1.refreshToken }),
      authService.refresh({ sessionId: t1.sessionId, refreshToken: t1.refreshToken }),
    ]);
    const successes = [a, b].filter(Boolean).length;
    expect(successes).toBe(1);
  });

  test('replaying a revoked refresh token revokes the whole family (FP-19)', async () => {
    const sessionsRepo = require('../src/repositories/sessions');
    const { userId } = await authService.signupClient({ pseudonym: 'Replay' });
    const t1 = await authService.issueTokens({ userId, role: 'client' });
    // Rotate once → t1 is now revoked, t2 is live.
    const t2 = await authService.refresh({ sessionId: t1.sessionId, refreshToken: t1.refreshToken });
    expect(t2).not.toBeNull();
    // Replay the OLD (revoked) token → triggers family revocation.
    const replay = await authService.refresh({ sessionId: t1.sessionId, refreshToken: t1.refreshToken });
    expect(replay).toBeNull();
    // The live session t2 must now also be refused.
    const afterFamilyRevoke = await authService.refresh({
      sessionId: t2.sessionId,
      refreshToken: t2.refreshToken,
    });
    expect(afterFamilyRevoke).toBeNull();
  });

  test('failed-attempt counter locks the account after 5 bad tries', async () => {
    const { userId } = await authService.signupClient({ pseudonym: 'Frank' });
    for (let i = 0; i < 5; i++) {
      await usersRepo.recordFailedAttempt(userId);
    }
    const u = await usersRepo.byId(userId);
    expect(u.failed_attempts).toBeGreaterThanOrEqual(5);
    // locked_until is BIGINT → string on Postgres, number on SQLite: coerce.
    expect(Number(u.locked_until)).toBeGreaterThan(Date.now());
  });
});

describe('authService — partner signup', () => {
  test('signupPartner persists profile with default status pending', async () => {
    const partnersRepo = require('../src/repositories/partners');
    const { userId, loginCode } = await authService.signupPartner({
      ownerName: 'Issa T.',
      companyName: 'Test Co',
      address: '5 place du Martroi, 45000 Orleans',
      lat: 47.9,
      lng: 1.9,
      email: 'partner@test.local',
      consent: true,
    });
    expect(loginCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const p = await partnersRepo.byId(userId);
    expect(p.companyName).toBe('Test Co');
    expect(p.status).toBe('pending');
  });
});
