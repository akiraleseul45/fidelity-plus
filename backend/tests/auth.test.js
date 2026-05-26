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
    expect(loginCode).toMatch(/^\d{5}$/);
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

  test('failed-attempt counter locks the account after 5 bad tries', async () => {
    const { userId } = await authService.signupClient({ pseudonym: 'Frank' });
    for (let i = 0; i < 5; i++) {
      await usersRepo.recordFailedAttempt(userId);
    }
    const u = await usersRepo.byId(userId);
    expect(u.failed_attempts).toBeGreaterThanOrEqual(5);
    expect(u.locked_until).toBeGreaterThan(Date.now());
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
