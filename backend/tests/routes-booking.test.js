/**
 * End-to-end HTTP tests for the reservation engine:
 *   /api/pro/*        (professional management)
 *   /api/booking/*    (public vitrine + slots + booking, client reservations)
 */

const request = require('supertest');
const { todayStr, addDays } = require('../src/lib/datetime');

function buildApp() {
  const express = require('express');
  const authRoutes = require('../src/routes/auth');
  const partnerRoutes = require('../src/routes/partners');
  const bookingRoutes = require('../src/routes/booking');
  const proRoutes = require('../src/routes/pro');
  const app = express();
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/partners', partnerRoutes);
  app.use('/api/booking', bookingRoutes);
  app.use('/api/pro', proRoutes);
  app.use((_err, _req, res, _next) => res.status(500).json({ success: false }));
  return app;
}

const app = buildApp();
const partnersRepo = require('../src/repositories/partners');

async function signupClient(name) {
  const r = await request(app).post('/api/auth/client/signup').send({ pseudonym: name, consent: true });
  return r.body;
}

async function makePartner(name, email, { enableBooking = true } = {}) {
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
  if (enableBooking) {
    await request(app)
      .put('/api/pro/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ modBooking: true });
    // Full-week availability 09:00–17:00 so any future date has slots.
    const rules = [];
    for (let wd = 1; wd <= 7; wd++) rules.push({ weekday: wd, startMin: 540, endMin: 1020 });
    await request(app)
      .put('/api/pro/availability/rules')
      .set('Authorization', `Bearer ${token}`)
      .send({ rules });
  }
  return { id: r.body.userId, token };
}

// A date far enough ahead to clear the default 120-min min-notice.
const BOOK_DATE = addDays(todayStr('Europe/Paris'), 2);

describe('reservation — pro setup + public booking flow', () => {
  test('service CRUD is scoped to the owner', async () => {
    const pro = await makePartner('SvcPro', 'svc@test.local');
    const create = await request(app)
      .post('/api/pro/services')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ name: 'Coupe', durationMin: 30, capacity: 1, priceCents: 2500 });
    expect(create.status).toBe(201);
    expect(create.body.service.name).toBe('Coupe');

    const other = await makePartner('OtherPro', 'other@test.local', { enableBooking: false });
    const del = await request(app)
      .delete(`/api/pro/services/${create.body.service.id}`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(del.status).toBe(404); // not the owner
  });

  test('slots → book → slot consumed → conflict on re-book', async () => {
    const pro = await makePartner('FlowPro', 'flowpro@test.local');
    const svc = await request(app)
      .post('/api/pro/services')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ name: 'Massage', durationMin: 60, capacity: 1 });
    const serviceId = svc.body.service.id;

    const slots = await request(app).get(
      `/api/booking/partner/${pro.id}/slots?serviceId=${serviceId}&date=${BOOK_DATE}`,
    );
    expect(slots.status).toBe(200);
    expect(slots.body.slots.length).toBeGreaterThan(0);
    const first = slots.body.slots[0];

    const book = await request(app)
      .post(`/api/booking/partner/${pro.id}/book`)
      .send({
        serviceId,
        date: BOOK_DATE,
        startMin: first.startMin,
        customerName: 'Jean Test',
        customerEmail: 'jean@test.local',
        acceptTerms: true,
      });
    expect(book.status).toBe(201);
    expect(book.body.booking.reference).toMatch(/^FP-/);

    // Capacity 1 → that slot disappears from availability.
    const slots2 = await request(app).get(
      `/api/booking/partner/${pro.id}/slots?serviceId=${serviceId}&date=${BOOK_DATE}`,
    );
    expect(slots2.body.slots.some((s) => s.startMin === first.startMin)).toBe(false);

    // Re-booking the same slot → 409 conflict.
    const clash = await request(app)
      .post(`/api/booking/partner/${pro.id}/book`)
      .send({
        serviceId,
        date: BOOK_DATE,
        startMin: first.startMin,
        customerName: 'Marie Test',
        customerEmail: 'marie@test.local',
        acceptTerms: true,
      });
    expect(clash.status).toBe(409);
  });

  test('signed-in client booking appears in /booking/me and can be cancelled', async () => {
    const pro = await makePartner('ClientBookPro', 'cbp@test.local');
    const svc = await request(app)
      .post('/api/pro/services')
      .set('Authorization', `Bearer ${pro.token}`)
      .send({ name: 'Brushing', durationMin: 30, capacity: 2 });
    const serviceId = svc.body.service.id;
    const client = await signupClient('BookingClient');

    const slots = await request(app).get(
      `/api/booking/partner/${pro.id}/slots?serviceId=${serviceId}&date=${BOOK_DATE}`,
    );
    const slot = slots.body.slots[0];
    const book = await request(app)
      .post(`/api/booking/partner/${pro.id}/book`)
      .set('Authorization', `Bearer ${client.accessToken}`)
      .send({
        serviceId,
        date: BOOK_DATE,
        startMin: slot.startMin,
        customerName: 'BookingClient',
        customerEmail: 'bc@test.local',
        acceptTerms: true,
      });
    expect(book.status).toBe(201);
    const bookingId = book.body.booking.id;

    const mine = await request(app)
      .get('/api/booking/me')
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items.some((b) => b.id === bookingId)).toBe(true);
    expect(mine.body.items[0].partnerName).toBe('ClientBookPro Co');

    const cancel = await request(app)
      .post(`/api/booking/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${client.accessToken}`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('cancelled');
  });
});

describe('reservation — guards', () => {
  test('booking disabled → slots 403, vitrine 404', async () => {
    const pro = await makePartner('NoBookPro', 'nobook@test.local', { enableBooking: false });
    const slots = await request(app).get(`/api/booking/partner/${pro.id}/slots?date=${BOOK_DATE}`);
    expect(slots.status).toBe(403);
    const vitrine = await request(app).get(`/api/booking/partner/${pro.id}`);
    expect(vitrine.status).toBe(404); // neither vitrine nor booking module on
  });

  test('vitrine becomes public once a public module is enabled', async () => {
    const pro = await makePartner('VitrinePro', 'vitrine@test.local'); // booking on
    const vitrine = await request(app).get(`/api/booking/partner/${pro.id}`);
    expect(vitrine.status).toBe(200);
    expect(vitrine.body.partner.companyName).toBe('VitrinePro Co');
    expect(vitrine.body.partner.modBooking).toBe(true);
  });

  test('appointment booking without a service → 400 service_required', async () => {
    const pro = await makePartner('NoSvcPro', 'nosvc@test.local');
    const slots = await request(app).get(`/api/booking/partner/${pro.id}/slots?date=${BOOK_DATE}`);
    expect(slots.status).toBe(400);
  });
});
