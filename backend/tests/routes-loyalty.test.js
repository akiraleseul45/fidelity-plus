/**
 * End-to-end HTTP tests for /api/loyalty/*.
 */

const request = require('supertest');

function buildApp() {
  const express = require('express');
  const cors = require('cors');
  const helmet = require('helmet');
  const authRoutes = require('../src/routes/auth');
  const loyaltyRoutes = require('../src/routes/loyalty');
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false }));
  return app;
}

const app = buildApp();

async function signupClient(name) {
  const r = await request(app)
    .post('/api/auth/client/signup')
    .send({ pseudonym: name, consent: true });
  return r.body;
}
async function signupPartner(name, email) {
  const r = await request(app)
    .post('/api/auth/partner/signup')
    .send({
      ownerName: name,
      companyName: name + ' Co',
      address: '5 place du Martroi, 45000 Orleans',
      lat: 47.9,
      lng: 1.9,
      email,
      consent: true,
    });
  return r.body;
}
async function loginPartner(code) {
  const r = await request(app)
    .post('/api/auth/partner/login')
    .send({ code });
  return r.body;
}

describe('routes — loyalty role guards', () => {
  test('client cannot access /loyalty/scan (403)', async () => {
    const c = await signupClient('GuardClient');
    const r = await request(app)
      .post('/api/loyalty/scan')
      .set('Authorization', `Bearer ${c.accessToken}`)
      .send({ qrToken: 'irrelevant.token' });
    expect(r.status).toBe(403);
  });

  test('partner cannot access /loyalty/qr (403)', async () => {
    const p = await signupPartner('GuardPartner', 'guard@test.local');
    const login = await loginPartner(p.loginCode);
    const r = await request(app)
      .get('/api/loyalty/qr')
      .set('Authorization', `Bearer ${login.accessToken}`);
    expect(r.status).toBe(403);
  });
});

describe('routes — full scan flow', () => {
  test('client gets QR, partner scans, points credited', async () => {
    const c = await signupClient('FlowClient');
    const p = await signupPartner('FlowPartner', 'flow@test.local');
    const partnerLogin = await loginPartner(p.loginCode);

    // 1. Client gets QR.
    const qr = await request(app)
      .get('/api/loyalty/qr')
      .set('Authorization', `Bearer ${c.accessToken}`);
    expect(qr.status).toBe(200);
    expect(qr.body.qrToken).toMatch(/^eyJ/);

    // 2. Partner scans.
    const scan = await request(app)
      .post('/api/loyalty/scan')
      .set('Authorization', `Bearer ${partnerLogin.accessToken}`)
      .send({ qrToken: qr.body.qrToken });
    expect(scan.status).toBe(200);
    expect(scan.body.points).toBe(1);
    expect(scan.body.pseudonym).toBe('FlowClient');

    // 3. Replay → 409.
    const replay = await request(app)
      .post('/api/loyalty/scan')
      .set('Authorization', `Bearer ${partnerLogin.accessToken}`)
      .send({ qrToken: qr.body.qrToken });
    expect(replay.status).toBe(409);

    // 4. Client sees the partner in /loyalty/me.
    const me = await request(app)
      .get('/api/loyalty/me')
      .set('Authorization', `Bearer ${c.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.items).toHaveLength(1);
    expect(me.body.items[0].points).toBe(1);

    // 5. Partner sees the client in /loyalty/partner.
    const list = await request(app)
      .get('/api/loyalty/partner')
      .set('Authorization', `Bearer ${partnerLogin.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].pseudonym).toBe('FlowClient');
  });
});

describe('routes — validation errors', () => {
  test('scan with missing qrToken → 400', async () => {
    const p = await signupPartner('Val', 'val@test.local');
    const pl = await loginPartner(p.loginCode);
    const r = await request(app)
      .post('/api/loyalty/scan')
      .set('Authorization', `Bearer ${pl.accessToken}`)
      .send({});
    expect(r.status).toBe(400);
  });

  test('redeem with non-UUID clientId → 400', async () => {
    const p = await signupPartner('Val2', 'val2@test.local');
    const pl = await loginPartner(p.loginCode);
    const r = await request(app)
      .post('/api/loyalty/redeem')
      .set('Authorization', `Bearer ${pl.accessToken}`)
      .send({ clientId: 'not-a-uuid' });
    expect(r.status).toBe(400);
  });
});
