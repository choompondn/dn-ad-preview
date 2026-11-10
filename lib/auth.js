// Shared-password gate. Cookie value = HMAC(APP_PASSWORD, "dnap-v1"); changing the password invalidates every cookie.
const { hmac, safeEqual } = require('./sign');

const COOKIE = 'dnap';
const MAX_AGE = 30 * 24 * 3600;

const expected = () => hmac(process.env.APP_PASSWORD || '', 'dnap-v1');

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthed(req) {
  if (!process.env.APP_PASSWORD) return false;
  const c = readCookie(req, COOKIE);
  return !!c && safeEqual(c, expected());
}

function loginCookie() {
  return `${COOKIE}=${expected()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
  return false;
}

module.exports = { isAuthed, loginCookie, requireAuth, readCookie };
