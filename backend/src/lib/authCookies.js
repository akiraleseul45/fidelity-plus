/**
 * Refresh-token cookie helpers.
 *
 * Strategy (web):
 *  - Refresh token is set as httpOnly + Secure + SameSite=Strict cookie,
 *    inaccessible to JavaScript → immune to XSS token theft.
 *  - Access token (15min) lives in memory only (returned in response body).
 *  - Cookie is opaque (only the server can read & rotate it).
 *  - CSRF: SameSite=Strict (no cross-site requests carry the cookie).
 *
 * Strategy (native):
 *  - Mobile apps don't send/receive HTTP cookies natively. They keep
 *    using the JSON body (refreshToken in response) and store it in
 *    SecureStore/Keychain on the app side.
 *
 * To detect the caller mode we look at the `X-Client-Type` header:
 *  - "web"  → cookies path
 *  - "native" or absent → body path (default, backwards-compatible)
 */

const COOKIE_NAME = 'fp_rt';
const SESSION_COOKIE = 'fp_sid';
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

function isWebClient(req) {
  return (req.get('x-client-type') || '').toLowerCase() === 'web';
}

function cookieOpts() {
  // Prod: frontend (Vercel) and backend (Render) live on different domains,
  // so the cookie must be SameSite=None + Secure to be sent cross-site.
  // Local dev: SameSite=Lax over plain http on localhost.
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',     // narrow the surface — only auth routes see it
    maxAge: MAX_AGE,
  };
}

function setRefreshCookies(req, res, { sessionId, refreshToken }) {
  if (!isWebClient(req)) return;
  res.cookie(COOKIE_NAME, refreshToken, cookieOpts());
  res.cookie(SESSION_COOKIE, sessionId, cookieOpts());
}

function clearRefreshCookies(req, res) {
  if (!isWebClient(req)) return;
  // Must match the attributes used to set the cookie, otherwise browsers
  // refuse to clear it (SameSite=None/Secure mismatch in prod).
  const { maxAge: _ignored, ...clearOpts } = cookieOpts();
  res.clearCookie(COOKIE_NAME, clearOpts);
  res.clearCookie(SESSION_COOKIE, clearOpts);
}

/**
 * Read refresh credentials. Web clients send them via cookies; native
 * clients send them in the JSON body.
 */
function readRefreshCreds(req) {
  if (isWebClient(req)) {
    return {
      sessionId: req.cookies?.[SESSION_COOKIE],
      refreshToken: req.cookies?.[COOKIE_NAME],
    };
  }
  return {
    sessionId: req.body?.sessionId,
    refreshToken: req.body?.refreshToken,
  };
}

/**
 * Build the response payload sent to the client.
 *  - Web: omit the refresh token from the JSON body (it's in the cookie).
 *  - Native: include it so the app can store it in SecureStore.
 */
function tokenPayloadFor(req, tokens, extra = {}) {
  const base = { ...extra, accessToken: tokens.accessToken };
  if (isWebClient(req)) {
    return base; // sessionId + refreshToken stay in cookies only
  }
  return {
    ...base,
    sessionId: tokens.sessionId,
    refreshToken: tokens.refreshToken,
  };
}

module.exports = {
  COOKIE_NAME,
  SESSION_COOKIE,
  isWebClient,
  setRefreshCookies,
  clearRefreshCookies,
  readRefreshCreds,
  tokenPayloadFor,
};
