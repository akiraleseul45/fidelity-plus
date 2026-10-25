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

  test('uses x-real-ip (Vercel proxy) when CF is absent', () => {
    expect(clientIp(mkReq({ 'X-Real-IP': '203.0.113.50' }, '10.0.0.1'))).toBe('203.0.113.50');
  });

  test('uses first entry of x-forwarded-for behind the proxy', () => {
    const req = mkReq({ 'X-Forwarded-For': '203.0.113.77, 70.0.0.1' }, '10.0.0.1');
    expect(clientIp(req)).toBe('203.0.113.77');
  });

  test('distinct proxied clients get distinct keys', () => {
    const a = clientIp(mkReq({ 'X-Forwarded-For': '203.0.113.1, 70.0.0.1' }));
    const b = clientIp(mkReq({ 'X-Forwarded-For': '203.0.113.2, 70.0.0.1' }));
    expect(a).not.toBe(b);
  });
});

describe('clientIp behind the Vercel proxy (A-02)', () => {
  const SECRET = 's'.repeat(40);
  let prev;
  beforeEach(() => {
    prev = process.env.PROXY_SHARED_SECRET;
    process.env.PROXY_SHARED_SECRET = SECRET;
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.PROXY_SHARED_SECRET;
    else process.env.PROXY_SHARED_SECRET = prev;
  });

  // What Cloudflare sends for a request relayed by Vercel: CF sees Vercel's
  // egress address, the middleware adds the visitor's real one + the secret.
  const viaVercel = (ip, secret = SECRET) =>
    mkReq({ 'CF-Connecting-IP': '76.76.21.1', 'x-fp-client-ip': ip, 'x-fp-proxy-secret': secret });

  test('trusts x-fp-client-ip over CF-Connecting-IP when the secret matches', () => {
    expect(clientIp(viaVercel('203.0.113.9'))).toBe('203.0.113.9');
  });

  test('two visitors relayed by the same Vercel node get distinct keys', () => {
    expect(clientIp(viaVercel('203.0.113.1'))).not.toBe(clientIp(viaVercel('203.0.113.2')));
  });

  test('ignores a forged x-fp-client-ip with a wrong secret', () => {
    expect(clientIp(viaVercel('1.2.3.4', 'x'.repeat(40)))).toBe('76.76.21.1');
  });

  test('ignores x-fp-client-ip without any secret header', () => {
    const req = mkReq({ 'CF-Connecting-IP': '198.51.100.3', 'x-fp-client-ip': '1.2.3.4' });
    expect(clientIp(req)).toBe('198.51.100.3');
  });

  test('ignores x-fp-client-ip when the server has no secret configured', () => {
    delete process.env.PROXY_SHARED_SECRET;
    expect(clientIp(viaVercel('1.2.3.4'))).toBe('76.76.21.1');
  });

  test('rejects a comma-list x-fp-client-ip even with the right secret', () => {
    expect(clientIp(viaVercel('1.1.1.1, 2.2.2.2'))).toBe('76.76.21.1');
  });
});
