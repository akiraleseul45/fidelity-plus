/**
 * Regression tests for the P1/P2 findings of the 25/10 audit (A-05 → A-16).
 */

jest.mock('../mailer');

const request = require('supertest');
const mailer = require('../mailer');
const { todayStr, addDays } = require('../src/lib/datetime');

function buildApp() {
  const express = require('express');
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/auth', require('../src/routes/auth'));
  app.use('/api/loyalty', require('../src/routes/loyalty'));
  app.use('/api/booking', require('../src/routes/booking'));
  app.use('/api/pro', require('../src/routes/pro'));
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false }));
  return app;
}

const app = buildApp();
const partnersRepo = require('../src/repositories/partners');
const usersRepo = require('../src/repositories/users');
const settingsRepo = require('../src/repositories/bookingSettings');
const loyaltyService = require('../src/services/loyalty');

const BOOK_DATE = addDays(todayStr('Europe/Paris'), 2);
const flush = () => new Promise((r) => setTimeout(r, 50));

let seq = 0;
async function makePro({ mode = 'appointment', bufferMin } = {}) {
  seq += 1;
  const name = `AuditPro${seq}`;
  const email = `auditpro${seq}@test.local`;
  const r = await request(app).post('/api/auth/partner/signup').send({
    ownerName: name,
    companyName: name + ' Co',
    address: '5 place du Martroi, 45000 Orleans',
    lat: 47.9,
    lng: 1.9,
    email,
    consent: true,
  });
  await partnersRepo.setStatus(r.body.userId, 'approved');
  const login = await request(app).post('/api/auth/partner/login').send({ code: r.body.loginCode });
  const token = login.body.accessToken;
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  await auth(request(app).put('/api/pro/profile')).send({ modBooking: true, bookingMode: mode });
  const rules = [];
  for (let wd = 1; wd <= 7; wd++) rules.push({ weekday: wd, startMin: 540, endMin: 1020 });
  await auth(request(app).put('/api/pro/availability/rules')).send({ rules });
  if (bufferMin != null) await auth(request(app).put('/api/pro/booking-settings')).send({ bufferMin });
  return { id: r.body.userId, email, token, auth };
}

async function addService(pro, body) {
  const r = await pro.auth(request(app).post('/api/pro/services')).send(body);
  return r.body.service.id;
}

function book(pro, body, clientToken) {
  seq += 1;
  const req = request(app).post(`/api/booking/partner/${pro.id}/book`);
  if (clientToken) req.set('Authorization', `Bearer ${clientToken}`);
  return req.send({
    date: BOOK_DATE,
    customerName: `Client ${seq}`,
    customerEmail: `client${seq}@test.local`,
    acceptTerms: true,
    ...body,
  });
}

async function slotStarts(pro, serviceId) {
  const r = await request(app).get(
    `/api/booking/partner/${pro.id}/slots?serviceId=${serviceId}&date=${BOOK_DATE}`,
  );
  return r.body.slots.map((s) => s.startMin);
}

const setStatus = (pro, id, status) =>
  pro.auth(request(app).post(`/api/pro/bookings/${id}/status`)).send({ status });

beforeEach(() => jest.clearAllMocks());

describe('A-05 — buffer time between bookings', () => {
  test('a 30-min buffer hides and refuses the slot right after a booking', async () => {
    const pro = await makePro({ bufferMin: 30 });
    const svc = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    expect((await book(pro, { serviceId: svc, startMin: 600 })).status).toBe(201);

    const starts = await slotStarts(pro, svc);
    expect(starts).not.toContain(630); // 10:30 is inside the buffer
    expect(starts).not.toContain(570); // 09:30 would end at 10:00 with no buffer left
    expect(starts).toContain(660);
    expect((await book(pro, { serviceId: svc, startMin: 630 })).status).toBe(409);
    expect((await book(pro, { serviceId: svc, startMin: 660 })).status).toBe(201);
  });
});

describe('A-06 — timezone validation', () => {
  test('an unknown timezone is refused, a real one accepted', async () => {
    const pro = await makePro();
    const bad = await pro.auth(request(app).put('/api/pro/booking-settings')).send({ timezone: 'Mars/Olympus' });
    expect(bad.status).toBe(400);
    const ok = await pro.auth(request(app).put('/api/pro/booking-settings')).send({ timezone: 'Europe/London' });
    expect(ok.status).toBe(200);
  });

  test('a bad value already stored no longer breaks the booking page', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Soin', durationMin: 30, capacity: 1 });
    await settingsRepo.update(pro.id, { timezone: 'Not/AZone' });
    expect((await request(app).get(`/api/booking/partner/${pro.id}`)).status).toBe(200);
    const slots = await request(app).get(
      `/api/booking/partner/${pro.id}/slots?serviceId=${svc}&date=${BOOK_DATE}`,
    );
    expect(slots.status).toBe(200);
    expect(slots.body.slots.length).toBeGreaterThan(0);
  });
});

describe('A-11 — capacity per service', () => {
  test('a group class fills its own places; another service blocks the slot', async () => {
    const pro = await makePro();
    const cut = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    const yoga = await addService(pro, { name: 'Cours', durationMin: 30, capacity: 3 });

    expect((await book(pro, { serviceId: yoga, startMin: 600 })).status).toBe(201);
    expect(await slotStarts(pro, yoga)).toContain(600); // 2 places left
    expect(await slotStarts(pro, cut)).not.toContain(600); // the pro is teaching
    expect((await book(pro, { serviceId: cut, startMin: 600 })).status).toBe(409);
    expect((await book(pro, { serviceId: yoga, startMin: 600 })).status).toBe(201);

    expect((await book(pro, { serviceId: cut, startMin: 720 })).status).toBe(201);
    expect(await slotStarts(pro, yoga)).not.toContain(720);
  });
});

describe('A-10 — status changes by the pro', () => {
  test('a cancelled booking cannot be reconfirmed once its slot is taken', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Massage', durationMin: 60, capacity: 1 });
    const first = await book(pro, { serviceId: svc, startMin: 600 });
    expect((await setStatus(pro, first.body.booking.id, 'cancelled')).status).toBe(200);
    expect((await book(pro, { serviceId: svc, startMin: 600 })).status).toBe(201);

    const reconfirm = await setStatus(pro, first.body.booking.id, 'confirmed');
    expect(reconfirm.status).toBe(409);
    expect(reconfirm.body.error).toMatch(/complet/);
  });

  test('a cancelled booking can be reconfirmed while its slot is free', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Massage', durationMin: 60, capacity: 1 });
    const b = await book(pro, { serviceId: svc, startMin: 600 });
    await setStatus(pro, b.body.booking.id, 'cancelled');
    const again = await setStatus(pro, b.body.booking.id, 'confirmed');
    expect(again.status).toBe(200);
    expect(again.body.booking.status).toBe('confirmed');
  });

  test('illogical moves are refused', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Massage', durationMin: 60, capacity: 1 });
    const b = await book(pro, { serviceId: svc, startMin: 600 });
    await setStatus(pro, b.body.booking.id, 'done');
    expect((await setStatus(pro, b.body.booking.id, 'pending')).status).toBe(409);
    await setStatus(pro, b.body.booking.id, 'no_show');
    expect((await setStatus(pro, b.body.booking.id, 'cancelled')).status).toBe(409);
  });
});

describe('A-08 — notifications between client and pro', () => {
  test('pro is told about a new booking and a client cancellation', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    const c = (await request(app).post('/api/auth/client/signup').send({ pseudonym: 'NotifClient', consent: true })).body;
    const b = await book(pro, { serviceId: svc, startMin: 600 }, c.accessToken);
    await flush();
    expect(mailer.sendBookingConfirmationMail).toHaveBeenCalledTimes(1);
    expect(mailer.sendProNewBookingMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: pro.email, reference: b.body.booking.reference, serviceName: 'Coupe' }),
    );

    await request(app)
      .post(`/api/booking/${b.body.booking.id}/cancel`)
      .set('Authorization', `Bearer ${c.accessToken}`);
    await flush();
    expect(mailer.sendProCancelledMail).toHaveBeenCalledWith(expect.objectContaining({ to: pro.email }));
  });

  test('client is told when the shop cancels', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    const b = await book(pro, { serviceId: svc, startMin: 600, customerEmail: 'victim@test.local' });
    await setStatus(pro, b.body.booking.id, 'cancelled');
    await flush();
    expect(mailer.sendClientCancelledByShopMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'victim@test.local', reference: b.body.booking.reference }),
    );
  });
});

describe('A-09 — account deletion anonymizes bookings', () => {
  test('the pro no longer sees the deleted client name or email', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    const c = (await request(app).post('/api/auth/client/signup').send({ pseudonym: 'GoneClient', consent: true })).body;
    await book(
      pro,
      { serviceId: svc, startMin: 600, customerName: 'Jean Dupont', customerEmail: 'jean.dupont@test.local', customerPhone: '0600000000' },
      c.accessToken,
    );
    const del = await request(app).delete('/api/auth/me').set('Authorization', `Bearer ${c.accessToken}`);
    expect(del.status).toBe(200);

    const list = await pro.auth(request(app).get('/api/pro/bookings'));
    const row = list.body.items[0];
    expect(row.customerName).toBe('Compte supprimé');
    expect(row.customerEmail).toBe('');
    expect(row.customerPhone).toBeNull();
  });
});

describe('A-13 — suspended pro', () => {
  test('cannot receive bookings through the API', async () => {
    const pro = await makePro();
    const svc = await addService(pro, { name: 'Coupe', durationMin: 30, capacity: 1 });
    await usersRepo.setSuspended(pro.id, true);
    expect((await book(pro, { serviceId: svc, startMin: 600 })).status).toBe(403);
  });
});

describe('A-14 — discount reward needs a percentage', () => {
  test('discount without value → 400, with value → 200', async () => {
    const pro = await makePro();
    const put = (body) => pro.auth(request(app).put('/api/loyalty/partner/settings')).send(body);
    expect((await put({ rewardThreshold: 10, rewardType: 'discount' })).status).toBe(400);
    expect((await put({ rewardThreshold: 10, rewardType: 'discount', rewardValue: 15 })).status).toBe(200);
    expect((await put({ rewardThreshold: 10, rewardType: 'free_meal' })).status).toBe(200);
  });
});

describe('A-16 — bookings per email address', () => {
  test('the 6th booking of the day for one address is refused', async () => {
    const pro = await makePro({ mode: 'table' });
    for (let i = 0; i < 5; i++) {
      expect((await book(pro, { startMin: 720, customerEmail: 'Same@Test.local' })).status).toBe(201);
    }
    const sixth = await book(pro, { startMin: 720, customerEmail: 'same@test.local' });
    expect(sixth.status).toBe(429);
  });
});

describe('A-07 — minimum delay between two points', () => {
  test('a second scan within the cooldown is refused without consuming the QR', async () => {
    const prev = process.env.SCAN_COOLDOWN_MIN;
    process.env.SCAN_COOLDOWN_MIN = '240';
    try {
      const pro = await makePro();
      const c = (await request(app).post('/api/auth/client/signup').send({ pseudonym: 'FastClient', consent: true })).body;
      const first = await loyaltyService.issueQrForClient(c.user.id);
      expect((await loyaltyService.scan({ qrToken: first.token, partnerId: pro.id })).ok).toBe(true);

      const second = await loyaltyService.issueQrForClient(c.user.id);
      const r = await loyaltyService.scan({ qrToken: second.token, partnerId: pro.id });
      expect(r.ok).toBe(false);
      expect(r.error).toBe('too_soon');
      expect(r.retryAfterMin).toBeGreaterThan(230);

      // Via the route: 409 with a readable message.
      const third = await loyaltyService.issueQrForClient(c.user.id);
      const http = await pro.auth(request(app).post('/api/loyalty/scan')).send({ qrToken: third.token });
      expect(http.status).toBe(409);
      expect(http.body.error).toMatch(/Prochain point possible dans 4 h/);

      // Cooldown off → the same unused QR still works.
      process.env.SCAN_COOLDOWN_MIN = '0';
      expect((await loyaltyService.scan({ qrToken: second.token, partnerId: pro.id })).points).toBe(2);
    } finally {
      process.env.SCAN_COOLDOWN_MIN = prev;
    }
  });
});
