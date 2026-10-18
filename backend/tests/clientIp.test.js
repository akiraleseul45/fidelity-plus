/**
 * Client-IP resolution (audit FP-02).
 *
 * Production is behind Cloudflare, so CF-Connecting-IP is the authoritative,
 * non-spoofable client address. These tests pin that behaviour and the
 * anti-spoofing guards.
 */
const { clientIp } = require('../src/lib/clientIp');

function mkReq(headers = {}, ip = '10.0.0.1') {
  // express lowercases header keys; mimic that.
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { headers: lower, ip };
}

describe('clientIp (FP-02)', () => {
  test('uses CF-Connecting-IP when present', () => {
    expect(clientIp(mkReq({ 'CF-Connecting-IP': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  test('CF-Connecting-IP wins over a spoofed X-Forwarded-For', () => {
    const req = mkReq({
      'CF-Connecting-IP': '203.0.113.9',
      'X-Forwarded-For': '1.2.3.4, 5.6.7.8',
    });
    expect(clientIp(req)).toBe('203.0.113.9');
  });

  test('falls back to req.ip when CF header is absent', () => {
    expect(clientIp(mkReq({}, '198.51.100.7'))).toBe('198.51.100.7');
  });

  test('rejects a forged comma-list CF-Connecting-IP (falls back to req.ip)', () => {
    const req = mkReq({ 'CF-Connecting-IP': '1.1.1.1, 2.2.2.2' }, '198.51.100.7');
    expect(clientIp(req)).toBe('198.51.100.7');
  });

  test('rejects an oversize CF-Connecting-IP value', () => {
    const req = mkReq({ 'CF-Connecting-IP': 'x'.repeat(100) }, '198.51.100.7');
    expect(clientIp(req)).toBe('198.51.100.7');
  });

  test('accepts an IPv6 CF-Connecting-IP', () => {
    expect(clientIp(mkReq({ 'CF-Connecting-IP': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  test('distinct clients produce distinct keys (no shared bucket)', () => {
    const a = clientIp(mkReq({ 'CF-Connecting-IP': '203.0.113.1' }));
    const b = clientIp(mkReq({ 'CF-Connecting-IP': '203.0.113.2' }));
    expect(a).not.toBe(b);
  });
});
