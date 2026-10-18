/**
 * End-to-end HTTP tests for /api/auth/*.
 *
 * Uses supertest to drive the real Express app — middleware (helmet,
 * validate, rateLimit, requireAuth, role guards) is exercised here.
 *
 * We import the app AFTER setting env vars (already done by setupEnv.js).
 */

const request = require('supertest');

// Build a minimal Express instance with just the auth + loyalty routes
// — we don't want the full server.js because it calls verifyTransport()
// (SMTP handshake) which would hit Gmail in tests.
function buildApp() {
  const express = require('express');
  const cors = require('cors');
  const helmet = require('helmet');
  const authRoutes = require('../src/routes/auth');
  const loyaltyRoutes = require('../src/routes/loyalty');
  const partnerRoutes = require('../src/routes/partners');
  const healthRoutes = require('../src/routes/health');

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use('/api/partners', partnerRoutes);
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'too large' });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'bad json' });
    }
    res.status(500).json({ success: false, error: 'internal' });
  });
  return app;
}

const app = buildApp();

describe('routes — POST /api/auth/client/signup', () => {
  test('400 when consent is missing', async () => {
    const res = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'NoConsent' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 when consent is false', async () => {
    const res = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'NoConsent2', consent: false });
    expect(res.status).toBe(400);
  });

  test('200 returns user + accessToken + sessionId + refreshToken', async () => {
    const res = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'SuperTest', consent: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('client');
    expect(res.body.loginCode).toMatch(/^\d{5}$/);
    expect(res.body.accessToken).toMatch(/^eyJ/);
    expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.refreshToken.length).toBeGreaterThan(20);
  });
});

describe('routes — POST /api/auth/client/login', () => {
  let validCode;
  beforeAll(async () => {
    const r = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'LoginTest', consent: true });
    validCode = r.body.loginCode;
  });

  test('401 on unknown code', async () => {
    const r = await request(app).post('/api/auth/client/login').send({ code: '00000' });
    expect(r.status).toBe(401);
  });

  test('400 on malformed code', async () => {
    const r = await request(app).post('/api/auth/client/login').send({ code: 'abc' });
    expect(r.status).toBe(400);
  });

  test('200 on valid code', async () => {
    const r = await request(app).post('/api/auth/client/login').send({ code: validCode });
    expect(r.status).toBe(200);
    expect(r.body.user.pseudonym).toBe('LoginTest');
  });
});

describe('routes — auth middleware', () => {
  test('401 on missing Authorization', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  test('401 on garbage token', async () => {
    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.jwt');
    expect(r.status).toBe(401);
  });

  test('200 with valid token', async () => {
    const signup = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'MeTest', consent: true });
    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(signup.body.user.id);
  });
});

describe('routes — refresh rotation', () => {
  test('valid refresh returns new tokens; old refresh is then invalid', async () => {
    const signup = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'Rotate', consent: true });

    const r1 = await request(app)
      .post('/api/auth/refresh')
      .send({ sessionId: signup.body.sessionId, refreshToken: signup.body.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.sessionId).not.toBe(signup.body.sessionId);

    // Reusing the OLD refresh must fail.
    const r2 = await request(app)
      .post('/api/auth/refresh')
      .send({ sessionId: signup.body.sessionId, refreshToken: signup.body.refreshToken });
    expect(r2.status).toBe(401);
  });
});

describe('routes — DELETE /api/auth/me (GDPR)', () => {
  test('soft-deletes the account and prevents subsequent /me', async () => {
    const signup = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'ToDelete', consent: true });

    const del = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    expect(del.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);
    expect(me.status).toBe(401); // deleted_at non-null → user invisible
  });

  test('deletion anonymises personal data and revokes sessions (FP-05)', async () => {
    const driver = require('../src/db/driver');
    const signup = await request(app)
      .post('/api/auth/client/signup')
      .send({ pseudonym: 'WipeMe', email: 'wipe@test.local', consent: true });
    const userId = signup.body.user.id;

    await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${signup.body.accessToken}`);

    const u = await driver.queryOne('SELECT email FROM users WHERE id = ?', [userId]);
    expect(u.email).toBeNull();
    const prof = await driver.queryOne('SELECT pseudonym FROM client_profiles WHERE user_id = ?', [userId]);
    expect(prof.pseudonym).toBe('Compte supprimé');
    const sessions = await driver.queryOne('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', [userId]);
    expect(sessions.n).toBe(0);
    const lookup = await driver.queryOne('SELECT COUNT(*) AS n FROM login_code_lookup WHERE user_id = ?', [userId]);
    expect(lookup.n).toBe(0);

    // The old login code can no longer be used.
    const login = await request(app)
      .post('/api/auth/client/login')
      .send({ code: signup.body.loginCode });
    expect(login.status).toBe(401);

    // The old refresh token is refused.
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ sessionId: signup.body.sessionId, refreshToken: signup.body.refreshToken });
    expect(refresh.status).toBe(401);
  });
});

describe('routes — health', () => {
  test('returns ok with db:up', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.checks.db).toBe('up');
  });
});
