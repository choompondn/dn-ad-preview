const { requireAuth } = require('../lib/auth');
const { fetchActive } = require('../lib/creatives');
const pages = require('../config/pages.json');
const slots = require('../config/slots.json');

let cache = null; // per warm instance
const TTL = 3600e3;

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const fresh = 'refresh' in (req.query || {});
    if (fresh || !cache || Date.now() - cache.at > TTL) {
      cache = { at: Date.now(), data: await fetchActive({ h5Secret: process.env.MOCK_SECRET }) };
    }
    res.end(JSON.stringify({ ...cache.data, fetchedAt: new Date(cache.at).toISOString(), pages, slots, site: process.env.SITE_ORIGIN || 'https://www.dailynews.co.th' }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
