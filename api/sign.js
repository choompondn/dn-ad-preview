// Signs a preview token for one page view: up to one creative per slot.
const { requireAuth } = require('../lib/auth');
const { signToken } = require('../lib/sign');

const SLOTS = new Set(['leaderboard', 'sticky', 'postarticle']);
const TTL_S = 24 * 3600;

function clean(items, origin) {
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!SLOTS.has(it.slot) || seen.has(it.slot)) continue;
    if (!['img', 'html5'].includes(it.type)) continue;
    let u = String(it.url || '');
    if (it.type === 'html5') u = origin + u; // relative /h5/... → absolute on this deployment
    if (!/^https:\/\//.test(u)) continue;
    const c = String(it.clickUrl || '');
    seen.add(it.slot);
    out.push({ s: it.slot, t: it.type, w: +it.w || 0, h: +it.h || 0, u, c: /^https?:\/\//.test(c) ? c : '' });
  }
  return out;
}

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end('{}'); }
  const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const items = clean(body.items, origin);
  if (!items.length) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'no items' })); }
  const token = signToken(process.env.MOCK_SECRET, { exp: Math.floor(Date.now() / 1000) + TTL_S, i: items });
  res.end(JSON.stringify({ token }));
};

module.exports.clean = clean;
