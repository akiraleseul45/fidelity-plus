/**
 * Loyalty service tests — QR signing, scan, anti-replay, redeem, reads.
 * All async after the M-4 driver migration.
 */

const authService = require('../src/services/auth');
const loyaltyService = require('../src/services/loyalty');
const loyaltyRepo = require('../src/repositories/loyalty');
const partnersRepo = require('../src/repositories/partners');

let clientId;
let partnerId;

// Helper: redeem now requires the client's live QR (audit FP-08).
async function redeemWithFreshQr(cId, pId) {
  const { token } = await loyaltyService.issueQrForClient(cId);
  return loyaltyService.redeem({ qrToken: token, partnerId: pId });
}

beforeAll(async () => {
  const c = await authService.signupClient({ pseudonym: 'Loyalty Client' });
  clientId = c.userId;
  const p = await authService.signupPartner({
    ownerName: 'O',
    companyName: 'Loy Co',
    address: '1 rue test, 45000 Orleans',
    email: 'loy@test.local',
    consent: true,
  });
  partnerId = p.userId;
  // Partners are created 'pending' and cannot scan/redeem until approved
  // (audit FP-09). Approve for the loyalty flow tests.
  await partnersRepo.setStatus(partnerId, 'approved');
});

describe('loyaltyService — QR + scan', () => {
  test('issueQrForClient returns a JWT token + ttl', async () => {
    const { token, expiresInSeconds } = await loyaltyService.issueQrForClient(clientId);
    expect(token).toMatch(/^eyJ/);
    expect(expiresInSeconds).toBe(60);
  });

  test('scan with a valid QR token adds exactly 1 point', async () => {
    const { token } = await loyaltyService.issueQrForClient(clientId);
    const r = await loyaltyService.scan({ qrToken: token, partnerId });
    expect(r.ok).toBe(true);
    expect(r.points).toBe(1);
    expect(r.pseudonym).toBe('Loyalty Client');
  });

  test('replay of the same QR is rejected with already_used', async () => {
    const { token } = await loyaltyService.issueQrForClient(clientId);
    const r1 = await loyaltyService.scan({ qrToken: token, partnerId });
    expect(r1.ok).toBe(true);
    const r2 = await loyaltyService.scan({ qrToken: token, partnerId });
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe('already_used');
  });

  test('forged QR (wrong signature) is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: clientId, nonce: 'fake' }, 'WRONG_SECRET');
    const r = await loyaltyService.scan({ qrToken: forged, partnerId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid');
  });

  test('unknown partner is rejected before any scan', async () => {
    const { token } = await loyaltyService.issueQrForClient(clientId);
    const r = await loyaltyService.scan({
      qrToken: token,
      partnerId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('unknown_partner');
  });
});

describe('loyaltyService — qr lifecycle / cleanup', () => {
  const qrRepo = require('../src/repositories/qrNonces');
  const driver = require('../src/db/driver');

  test('purgeExpired removes only nonces past expiry', async () => {
    const past = Date.now() - 60_000;
    await driver.mutate(
      'INSERT INTO qr_nonces (nonce, client_id, issued_at, expires_at) VALUES (?, ?, ?, ?)',
      ['expired-nonce-test', clientId, past, past + 10_000],
    );
    const removed = await qrRepo.purgeExpired();
    expect(removed).toBeGreaterThanOrEqual(1);
    const empty = await qrRepo.purgeExpired();
    expect(empty).toBe(0);
  });
});

describe('loyaltyService — redeem', () => {
  test('redeem fails when balance < threshold (and keeps the nonce)', async () => {
    const r = await redeemWithFreshQr(clientId, partnerId);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('insufficient_points');
  });

  test('redeem succeeds and removes threshold points when enough', async () => {
    for (let i = 0; i < 12; i++) {
      const { token } = await loyaltyService.issueQrForClient(clientId);
      await loyaltyService.scan({ qrToken: token, partnerId });
    }
    const before = await loyaltyRepo.balanceOf(clientId, partnerId);
    const r = await redeemWithFreshQr(clientId, partnerId);
    expect(r.ok).toBe(true);
    expect(r.points).toBe(before - 10);
  });

  test('redeem is rejected for a non-approved partner (FP-09)', async () => {
    const pend = await authService.signupPartner({
      ownerName: 'P', companyName: 'Pending Co', address: '2 rue test, 45000 Orleans',
      email: 'pending-redeem@test.local', consent: true,
    });
    const { token } = await loyaltyService.issueQrForClient(clientId);
    const r = await loyaltyService.redeem({ qrToken: token, partnerId: pend.userId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('partner_not_approved');
  });

  test('redeem requires the client QR, not a raw clientId (FP-08)', async () => {
    // Passing no qrToken must not redeem anything.
    const r = await loyaltyService.redeem({ qrToken: 'not-a-real-token-xxxxxxxx', partnerId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('invalid');
  });
});

describe('loyaltyService — concurrency & status (FP-07, FP-09)', () => {
  test('two concurrent redeems credit exactly one reward', async () => {
    const c = await authService.signupClient({ pseudonym: 'RaceC' });
    const p = await authService.signupPartner({
      ownerName: 'R', companyName: 'Race Co', address: '3 rue test, 45000 Orleans',
      email: 'race@test.local', consent: true,
    });
    await partnersRepo.setStatus(p.userId, 'approved');
    for (let i = 0; i < 10; i++) {
      const { token } = await loyaltyService.issueQrForClient(c.userId);
      await loyaltyService.scan({ qrToken: token, partnerId: p.userId });
    }
    const [t1, t2] = await Promise.all([
      loyaltyService.issueQrForClient(c.userId),
      loyaltyService.issueQrForClient(c.userId),
    ]);
    const results = await Promise.all([
      loyaltyService.redeem({ qrToken: t1.token, partnerId: p.userId }),
      loyaltyService.redeem({ qrToken: t2.token, partnerId: p.userId }),
    ]);
    const successes = results.filter((r) => r.ok).length;
    expect(successes).toBe(1);
    const balance = await loyaltyRepo.balanceOf(c.userId, p.userId);
    expect(balance).toBe(0);
    // Journal must match the balance: exactly one redeem row of -10.
    const driver = require('../src/db/driver');
    const redeems = await driver.query(
      "SELECT delta FROM scans WHERE client_id = ? AND partner_id = ? AND kind = 'redeem'",
      [c.userId, p.userId],
    );
    expect(redeems).toHaveLength(1);
    expect(redeems[0].delta).toBe(-10);
  });

  test('pending partner cannot scan (FP-09)', async () => {
    const c = await authService.signupClient({ pseudonym: 'PendClient' });
    const p = await authService.signupPartner({
      ownerName: 'P', companyName: 'Pend Co', address: '4 rue test, 45000 Orleans',
      email: 'pend-scan@test.local', consent: true,
    });
    const { token } = await loyaltyService.issueQrForClient(c.userId);
    const r = await loyaltyService.scan({ qrToken: token, partnerId: p.userId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('partner_not_approved');
  });

  test('suspended partner cannot scan (FP-09)', async () => {
    const c = await authService.signupClient({ pseudonym: 'SuspClient' });
    const p = await authService.signupPartner({
      ownerName: 'S', companyName: 'Susp Co', address: '5 rue test, 45000 Orleans',
      email: 'susp-scan@test.local', consent: true,
    });
    await partnersRepo.setStatus(p.userId, 'approved');
    await partnersRepo.setStatus(p.userId, 'suspended');
    const { token } = await loyaltyService.issueQrForClient(c.userId);
    const r = await loyaltyService.scan({ qrToken: token, partnerId: p.userId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('partner_not_approved');
  });
});

describe('loyaltyService — reads', () => {
  test('listForClient returns the partner with points', async () => {
    const items = await loyaltyService.listForClient(clientId);
    const row = items.find((i) => i.partnerId === partnerId);
    expect(row).toBeDefined();
    expect(row.companyName).toBe('Loy Co');
    expect(row.points).toBeGreaterThanOrEqual(0);
  });

  test('listForPartner returns the client with points', async () => {
    const items = await loyaltyService.listForPartner(partnerId);
    const row = items.find((i) => i.clientId === clientId);
    expect(row).toBeDefined();
    expect(row.pseudonym).toBe('Loyalty Client');
  });
});
