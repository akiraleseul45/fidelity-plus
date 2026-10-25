/**
 * Resolve the real client IP behind the production proxy chain.
 *
 * Production traffic reaches the API as:
 *   client → Cloudflare → Render load balancer → app
 *
 * `req.ip` (even with `trust proxy`) resolves to a Render/Cloudflare hop,
 * not the visitor — so rate-limiting keyed on `req.ip` is shared by every
 * visitor (see audit FP-02). Cloudflare sets `CF-Connecting-IP` to the true
 * client address and strips any client-supplied copy, so it is the
 * authoritative source when the request actually came through Cloudflare.
 *
 * `CF-Connecting-IP` is a single IP (never a comma list). We reject anything
 * that looks forged (list, oversize) and fall back to `req.ip` otherwise, so
 * a direct hit on the onrender.com origin still gets *some* key rather than a
 * spoofable one.
 */
const crypto = require('crypto');

function isPlausibleIp(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 45 && !v.includes(' ');
}

// Requests coming through the Vercel proxy (the site's own /api/*) reach us
// from Vercel's egress, so CF-Connecting-IP holds a Vercel address, not the
// visitor's (audit A-02). The Vercel middleware (app/middleware.js) forwards
// the real IP in x-fp-client-ip with a shared secret; we trust that header
// only when the secret matches, so a direct hit on onrender.com can't forge it.
function proxiedIp(h) {
  const secret = process.env.PROXY_SHARED_SECRET;
  if (!secret || secret.length < 32) return null;
  const given = h['x-fp-proxy-secret'];
  if (typeof given !== 'string') return null;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const ip = h['x-fp-client-ip'];
  return isPlausibleIp(ip) && !ip.includes(',') ? ip.trim() : null;
}

function clientIp(req) {
  const h = req.headers || {};

  // 0. Our own Vercel proxy, authenticated by the shared secret.
  const proxied = proxiedIp(h);
  if (proxied) return proxied;

  // 1. Cloudflare (single, non-spoofable when traffic actually goes through CF).
  const cf = h['cf-connecting-ip'];
  if (isPlausibleIp(cf) && !cf.includes(',')) return cf.trim();

  // 2. Behind the Vercel proxy (same-origin API): Vercel sets the real client
  //    IP here. x-vercel-forwarded-for / x-real-ip are single values; the
  //    standard x-forwarded-for may be a list whose first entry is the client.
  const vercel = h['x-vercel-forwarded-for'] || h['x-real-ip'];
  if (isPlausibleIp(vercel) && !vercel.includes(',')) return vercel.trim();

  const xff = h['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    const first = xff.split(',')[0].trim();
    if (isPlausibleIp(first)) return first;
  }

  return req.ip;
}

module.exports = { clientIp };
