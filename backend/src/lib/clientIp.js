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
function isPlausibleIp(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 45 && !v.includes(' ');
}

function clientIp(req) {
  const h = req.headers || {};

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
