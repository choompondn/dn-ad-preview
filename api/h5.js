// Serves files from an HTML5 creative bundle: /h5/<creativeId>/<sig>/<path>
// Public (shown inside an iframe on dailynews.co.th) but each creative URL is HMAC-signed.
const { hmac, safeEqual } = require('../lib/sign');
const { byIds } = require('../lib/gam');
const { readZip, entryHtml } = require('../lib/zip');

const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf' };
const zips = new Map(); // creativeId → zip (per warm instance)

module.exports = async (req, res) => {
  const { id = '', sig = '', path = '' } = req.query || {};
  if (!/^\d+$/.test(id) || !safeEqual(sig, hmac(process.env.MOCK_SECRET, 'h5:' + id).slice(0, 22))) {
    res.statusCode = 403; return res.end('forbidden');
  }
  try {
    let zip = zips.get(id);
    if (!zip) {
      const [cr] = await byIds('CreativeService', 'getCreativesByStatement', [id]);
      const url = cr && cr.html5Asset && cr.html5Asset.assetUrl;
      if (!url) { res.statusCode = 404; return res.end('no html5 asset'); }
      zip = readZip(Buffer.from(await (await fetch(url)).arrayBuffer()));
      zips.set(id, zip);
    }
    const entry = entryHtml(zip.names);
    const base = entry && entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
    const want = String(path || '').replace(/^\/+/, '');
    if (!want) { // redirect to entry so relative asset paths resolve
      res.statusCode = 302; const c = req.query.c ? `?c=${encodeURIComponent(req.query.c)}` : '';
      res.setHeader('Location', `/h5/${id}/${sig}/${entry}${c}`); return res.end();
    }
    if (want.includes('..')) { res.statusCode = 400; return res.end(); }
    let data = zip.get(want) || zip.get(base + want);
    if (!data) { res.statusCode = 404; return res.end('not found'); }
    const ext = want.split('.').pop().toLowerCase();
    if (ext === 'html' || ext === 'htm') {
      // clickTag: give the creative its destination via the standard variable name
      const click = String(req.query.c || '').replace(/["<>\\]/g, '');
      data = Buffer.from(`<script>var clickTag=${JSON.stringify(click)};</script>` + data.toString('utf8'));
    }
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.end(data);
  } catch (e) {
    res.statusCode = 502; res.end(String(e.message || e));
  }
};
