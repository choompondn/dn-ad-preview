// HMAC helpers shared by the app cookie, preview tokens and HTML5 URLs.
// Token format (must match wp/dn-ad-preview.php): base64url(json) + "." + base64url(hmac_sha256(secret, base64url(json)))
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (secret, data) => b64u(crypto.createHmac('sha256', secret).update(data).digest());

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function signToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  return body + '.' + hmac(secret, body);
}

function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!safeEqual(sig, hmac(secret, body))) return null;
  let p;
  try { p = JSON.parse(fromB64u(body).toString('utf8')); } catch { return null; }
  if (!p || typeof p.exp !== 'number' || p.exp * 1000 < now) return null;
  return p;
}

module.exports = { b64u, fromB64u, hmac, safeEqual, signToken, verifyToken };
