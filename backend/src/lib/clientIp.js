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
function clientIp(req) {
  const cf = req.headers && req.headers['cf-connecting-ip'];
  if (
    typeof cf === 'string' &&
    cf.length > 0 &&
    cf.length <= 45 && // max length of an IPv6 textual address
    !cf.includes(',') &&
    !cf.includes(' ')
  ) {
    return cf.trim();
  }
  return req.ip;
}

module.exports = { clientIp };
