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
  const partnerRoutes = require('../src/routes/partners');
  const adminRoutes = require('../src/routes/admin');
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/loyalty', loyaltyRoutes);
  app.use('/api/partners', partnerRoutes);
  app.use('/api/admin', adminRoutes);
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
const partnersRepo = require('../src/repositories/partners');

async function signupPartner(name, email, { approve = true, category, serviceMode } = {}) {
  const body = {
    ownerName: name,
    companyName: name + ' Co',
    address: '5 place du Martroi, 45000 Orleans',
    lat: 47.9,
    lng: 1.9,
    email,
    consent: true,
  };
  if (category) body.category = category;
  if (serviceMode) body.serviceMode = serviceMode;
  const r = await request(app).post('/api/auth/partner/signup').send(body);
  // Partners start 'pending' (audit FP-09); approve for flow tests.
  if (approve && r.body.userId) await partnersRepo.setStatus(r.body.userId, 'approved');
  return r.body;
}

const ADMIN_TOKEN = 'test-admin-token-xxxxxxxxxxxxxxxx';
// Provision an admin account via the shared bootstrap token, then log in.
async function provisionAndLoginAdmin() {
  const prev = process.env.ADMIN_API_TOKEN;
  process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
  const prov = await request(app)
    .post('/api/admin/provision')
    .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    .send({});
  const login = await request(app)
    .post('/api/auth/admin/login')
    .send({ code: prov.body.loginCode });
  if (prev !== undefined) process.env.ADMIN_API_TOKEN = prev;
  else delete process.env.ADMIN_API_TOKEN;
  return { token: login.body.accessToken, code: prov.body.loginCode };
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

  test('redeem with missing qrToken → 400', async () => {
    const p = await signupPartner('Val2', 'val2@test.local');
    const pl = await loginPartner(p.loginCode);
    const r = await request(app)
      .post('/api/loyalty/redeem')
      .set('Authorization', `Bearer ${pl.accessToken}`)
      .send({});
    expect(r.status).toBe(400);
  });
});

describe('routes — partner approval gate (FP-09)', () => {
  test('pending partner scan → 403', async () => {
    const c = await signupClient('GatedClient');
    const p = await signupPartner('GatedPartner', 'gated@test.local', { approve: false });
    const pl = await loginPartner(p.loginCode);
    // client issues a QR
    const qr = await request(app)
      .get('/api/loyalty/qr')
      .set('Authorization', `Bearer ${c.accessToken}`);
    const r = await request(app)
      .post('/api/loyalty/scan')
      .set('Authorization', `Bearer ${pl.accessToken}`)
      .send({ qrToken: qr.body.qrToken });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/validé/i);
  });

  test('public /api/partners excludes non-approved partners', async () => {
    await signupPartner('HiddenPartner', 'hidden@test.local', { approve: false });
    const r = await request(app).get('/api/partners');
    expect(r.status).toBe(200);
    const hidden = (r.body.items || []).find((i) => i.companyName === 'HiddenPartner Co');
    expect(hidden).toBeUndefined();
  });
});

describe('routes — partner categories & client filters', () => {
  test('signup stores category + service mode, returned by /api/partners', async () => {
    await signupPartner('ResoA', 'resoa@test.local', { category: 'restaurant', serviceMode: 'sur_place' });
    const r = await request(app).get('/api/partners');
    const found = (r.body.items || []).find((i) => i.companyName === 'ResoA Co');
    expect(found).toBeDefined();
    expect(found.category).toBe('restaurant');
    expect(found.serviceMode).toBe('sur_place');
  });

  test('category filter narrows the list', async () => {
    await signupPartner('CoifA', 'coifa@test.local', { category: 'coiffeur', serviceMode: 'a_domicile' });
    const r = await request(app).get('/api/partners?category=coiffeur');
    const items = r.body.items || [];
    expect(items.every((i) => i.category === 'coiffeur')).toBe(true);
    expect(items.find((i) => i.companyName === 'CoifA Co')).toBeDefined();
  });

  test('serviceMode filter: a_domicile excludes sur_place-only, includes les_deux', async () => {
    await signupPartner('OnSiteOnly', 'onsite@test.local', { category: 'mecanique', serviceMode: 'sur_place' });
    await signupPartner('BothModes', 'both@test.local', { category: 'mecanique', serviceMode: 'les_deux' });
    const r = await request(app).get('/api/partners?serviceMode=a_domicile');
    const names = (r.body.items || []).map((i) => i.companyName);
    expect(names).toContain('BothModes Co');
    expect(names).not.toContain('OnSiteOnly Co');
  });

  test('bad category value is ignored (no filter)', async () => {
    const r = await request(app).get('/api/partners?category=not_a_real_cat');
    expect(r.status).toBe(200);
  });
});

describe('routes — admin account', () => {
  test('provision is 404 when ADMIN_API_TOKEN not configured', async () => {
    const prev = process.env.ADMIN_API_TOKEN;
    delete process.env.ADMIN_API_TOKEN;
    const r = await request(app).post('/api/admin/provision').send({});
    expect(r.status).toBe(404);
    if (prev !== undefined) process.env.ADMIN_API_TOKEN = prev;
  });

  test('provision requires the shared token, returns a 12-char code', async () => {
    const prev = process.env.ADMIN_API_TOKEN;
    process.env.ADMIN_API_TOKEN = ADMIN_TOKEN;
    const bad = await request(app)
      .post('/api/admin/provision')
      .set('Authorization', 'Bearer wrong-token-xxxxxxxxxxxxxxxxxxxx')
      .send({});
    expect(bad.status).toBe(401);
    const ok = await request(app)
      .post('/api/admin/provision')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.loginCode).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    if (prev !== undefined) process.env.ADMIN_API_TOKEN = prev;
    else delete process.env.ADMIN_API_TOKEN;
  });

  test('admin can log in and approve a pending partner', async () => {
    const admin = await provisionAndLoginAdmin();
    expect(admin.token).toMatch(/^eyJ/);
    const p = await signupPartner('ApproveMe', 'approveme@test.local', { approve: false });
    const ok = await request(app)
      .put(`/api/admin/partners/${p.userId}/status`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    expect(ok.status).toBe(200);
    expect(ok.body.partner.status).toBe('approved');
  });

  test('non-admin token is refused by admin management (403)', async () => {
    const c = await signupClient('NotAdmin');
    const r = await request(app)
      .get('/api/admin/partners')
      .set('Authorization', `Bearer ${c.accessToken}`);
    expect(r.status).toBe(403);
  });

  test('admin lists clients, can edit and suspend; suspended client is blocked', async () => {
    const admin = await provisionAndLoginAdmin();
    const c = await signupClient('ManageMe');
    // list clients
    const list = await request(app)
      .get('/api/admin/clients')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    const me = (list.body.items || []).find((i) => i.pseudonym === 'ManageMe');
    expect(me).toBeDefined();
    // suspend
    const susp = await request(app)
      .post(`/api/admin/clients/${me.id}/suspend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ suspended: true });
    expect(susp.status).toBe(200);
    // suspended client can no longer use its access token
    const blocked = await request(app)
      .get('/api/loyalty/me')
      .set('Authorization', `Bearer ${c.accessToken}`);
    expect(blocked.status).toBe(403);
  });

  test('admin can delete a partner (anonymised, gone from listing)', async () => {
    const admin = await provisionAndLoginAdmin();
    const p = await signupPartner('DeleteMe', 'deleteme@test.local');
    const del = await request(app)
      .delete(`/api/admin/partners/${p.userId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(200);
    const list = await request(app)
      .get('/api/admin/partners')
      .set('Authorization', `Bearer ${admin.token}`);
    expect((list.body.items || []).find((i) => i.id === p.userId)).toBeUndefined();
  });
});
