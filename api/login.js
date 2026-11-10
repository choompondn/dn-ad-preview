const { loginCookie, isAuthed } = require('../lib/auth');
const { safeEqual } = require('../lib/sign');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.end(JSON.stringify({ authed: isAuthed(req) }));
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('{}'); }
  const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  const pw = process.env.APP_PASSWORD;
  if (!pw || !safeEqual(String(body.password || ''), pw)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'รหัสผ่านไม่ถูกต้อง' }));
  }
  res.setHeader('Set-Cookie', loginCookie());
  res.end(JSON.stringify({ ok: true }));
};
