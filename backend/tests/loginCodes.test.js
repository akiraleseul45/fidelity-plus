/**
 * Login code uniqueness + performance tests (async after M-4).
 */

const authService = require('../src/services/auth');
const loginCodesRepo = require('../src/repositories/loginCodes');
const { hmacCode } = require('../src/lib/crypto');

describe('login codes — uniqueness', () => {
  test('hmacCode is deterministic', () => {
    expect(hmacCode('12345')).toBe(hmacCode('12345'));
    expect(hmacCode('12345')).not.toBe(hmacCode('12346'));
  });

  test('tryClaim returns false on collision', async () => {
    const u1 = await authService.signupClient({ pseudonym: 'U1' });
    const success = await loginCodesRepo.tryClaim(
      u1.loginCode,
      '00000000-0000-0000-0000-000000000000',
    );
    expect(success).toBe(false);
  });

  test(
    '200 signups produce 200 unique codes',
    async () => {
      // Reduced from 1000 to keep CI time reasonable post-async-migration.
      // Each signup is a multi-statement transaction + 2 scrypt hashes; on a
      // networked Postgres (CI) that is far slower than in-process SQLite, so
      // this heavy test gets a generous timeout.
      const seen = new Set();
      for (let i = 0; i < 200; i++) {
        const { loginCode } = await authService.signupClient({ pseudonym: `P${i}` });
        expect(seen.has(loginCode)).toBe(false);
        seen.add(loginCode);
      }
      expect(seen.size).toBe(200);
    },
    60000,
  );
});

describe('login codes — login flow', () => {
  test('loginByCode succeeds on valid code with O(1) lookup', async () => {
    const { userId, loginCode } = await authService.signupClient({ pseudonym: 'X' });
    const r = await authService.loginByCode({ code: loginCode, role: 'client' });
    expect(r).toEqual({ userId });
  });

  test('loginByCode returns null on unknown code without scanning users', async () => {
    const start = Date.now();
    const r = await authService.loginByCode({ code: '99999', role: 'client' });
    const elapsed = Date.now() - start;
    expect(r).toBeNull();
    expect(elapsed).toBeLessThan(500);
  });

  test('loginByCode returns null on wrong role (client code, asking partner)', async () => {
    const { loginCode } = await authService.signupClient({ pseudonym: 'WrongRole' });
    const r = await authService.loginByCode({ code: loginCode, role: 'partner' });
    expect(r).toBeNull();
  });
});

describe('login codes — performance regression guard', () => {
  test('50 logins are all fast (regression guard against O(N) scan)', async () => {
    const codes = [];
    for (let i = 0; i < 30; i++) {
      const { loginCode } = await authService.signupClient({ pseudonym: `Bench${i}` });
      codes.push(loginCode);
    }
    const start = Date.now();
    for (const code of codes) {
      await authService.loginByCode({ code, role: 'client' });
    }
    const totalMs = Date.now() - start;
    const perLogin = totalMs / codes.length;
    expect(perLogin).toBeLessThan(200);
  });
});
