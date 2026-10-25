/**
 * Vercel Routing Middleware — runs before the /api/* rewrite to Render.
 *
 * Behind the Vercel proxy the backend only sees Vercel's egress address
 * (Cloudflare puts it in CF-Connecting-IP), so per-visitor rate limiting
 * stopped working (audit A-02). Here we still know the real visitor IP, so we
 * forward it in `x-fp-client-ip`, together with a shared secret the backend
 * checks before trusting it. Both headers are always overwritten, so a
 * visitor cannot inject their own values through the site.
 */
import { ipAddress, next } from '@vercel/functions';

export const config = {
  matcher: '/api/:path*',
};

export default function middleware(request) {
  const secret = process.env.PROXY_SHARED_SECRET;
  const headers = new Headers(request.headers);
  headers.delete('x-fp-client-ip');
  headers.delete('x-fp-proxy-secret');

  const ip = ipAddress(request);
  if (secret && ip) {
    headers.set('x-fp-client-ip', ip);
    headers.set('x-fp-proxy-secret', secret);
  }
  return next({ request: { headers } });
}
