/**
 * Loyalty service tests — QR signing, scan, anti-replay, redeem, reads.
 * All async after the M-4 driver migration.
 */

const authService = require('../src/services/auth');
const loyaltyService = require('../src/services/loyalty');
const loyaltyRepo = require('../src/repositories/loyalty');

let clientId;
let partnerId;

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
  test('redeem fails when balance < threshold', async () => {
    const r = await loyaltyService.redeem({ clientId, partnerId });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('insufficient_points');
  });

  test('redeem succeeds and removes threshold points when enough', async () => {
    for (let i = 0; i < 12; i++) {
      const { token } = await loyaltyService.issueQrForClient(clientId);
      await loyaltyService.scan({ qrToken: token, partnerId });
    }
    const before = await loyaltyRepo.balanceOf(clientId, partnerId);
    const r = await loyaltyService.redeem({ clientId, partnerId });
    expect(r.ok).toBe(true);
    expect(r.points).toBe(before - 10);
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
