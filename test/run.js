// node test/run.js — zero-dependency tests
const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');
const zlib = require('zlib');
const { signToken, verifyToken } = require('../lib/sign');
const { parse, arr } = require('../lib/xml');
const { buildItems, todayBangkok } = require('../lib/creatives');
const { readZip, entryHtml } = require('../lib/zip');
const { clean } = require('../api/sign');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('token round-trip + tamper + expiry', () => {
  const tok = signToken('s3cret', { exp: Math.floor(Date.now() / 1000) + 60, i: [{ s: 'sticky' }] });
  assert.deepStrictEqual(verifyToken('s3cret', tok).i, [{ s: 'sticky' }]);
  assert.strictEqual(verifyToken('wrong', tok), null);
  assert.strictEqual(verifyToken('s3cret', tok.slice(0, -2) + 'xx'), null);
  assert.strictEqual(verifyToken('s3cret', signToken('s3cret', { exp: 1 })), null);
});

t('PHP plugin accepts token signed by Node, rejects bad one', () => {
  const items = [{ s: 'leaderboard', t: 'img', w: 970, h: 250, u: 'https://tpc.googlesyndication.com/x.jpg', c: 'https://ex.com/' },
                 { s: 'bogus', t: 'img', w: 1, h: 1, u: 'https://x/y' }];
  const tok = signToken('k', { exp: Math.floor(Date.now() / 1000) + 60, i: items });
  const php = `
    define('ABSPATH', '/'); define('DN_AD_PREVIEW_SECRET', 'k');
    function add_action(){} function wp_unslash($s){return $s;} function esc_url_raw($u){return $u;}
    require '${path.join(__dirname, '../wp/dn-ad-preview.php')}';
    $_GET['dn_mock'] = $argv[1];
    echo json_encode(dn_ad_preview_items());`;
  const out = JSON.parse(execFileSync('php', ['-r', php, '--', tok]).toString());
  assert.deepStrictEqual(Object.keys(out), ['div-ads-leaderboard']);
  assert.strictEqual(out['div-ads-leaderboard'].w, 970);
  const bad = execFileSync('php', ['-r', php, '--', tok + 'x']).toString();
  assert.strictEqual(bad, 'null');
});

t('xml parser: namespaces, arrays, xsi:type', () => {
  const x = `<soap:Envelope xmlns:soap="s"><soap:Body><getCreativesByStatementResponse xmlns="ns"><rval>
    <totalResultSetSize>2</totalResultSetSize>
    <results xsi:type="ImageCreative" xmlns:xsi="x"><id>1</id><name>A &amp; B</name><size><width>970</width><height>250</height></size><primaryImageAsset><assetUrl>https://i/1.jpg</assetUrl></primaryImageAsset></results>
    <results xsi:type="Html5Creative"><id>2</id><name>H</name></results>
  </rval></getCreativesByStatementResponse></soap:Body></soap:Envelope>`;
  const rv = parse(x).Envelope.Body.getCreativesByStatementResponse.rval;
  const r = arr(rv.results);
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0]._type, 'ImageCreative');
  assert.strictEqual(r[0].name, 'A & B');
  assert.strictEqual(r[0].size.width, '970');
  assert.strictEqual(r[1]._type, 'Html5Creative');
});

t('buildItems: slot by ad unit ID, date filter, guessed slot, categories', () => {
  const today = '2026-11-11';
  const d = (y, m, dd) => ({ date: { year: y, month: m, day: dd } });
  const items = buildItems({
    today, h5Secret: 'k',
    lineItems: [
      { id: '10', orderId: '5', name: 'LI LB', status: 'DELIVERING', startDateTime: d(2026, 11, 1), endDateTime: d(2026, 11, 30),
        targeting: { inventoryTargeting: { targetedAdUnits: [{ adUnitId: '90751040' }, { adUnitId: '23196688839' }] },
                     customTargeting: { children: { children: { keyId: '1', valueIds: '9', _x: 'crime' } } } } },
      { id: '11', orderId: '5', name: 'LI parent', status: 'DELIVERING', startDateTime: d(2026, 11, 1), endDateTime: d(2026, 11, 30),
        targeting: { inventoryTargeting: { targetedAdUnits: { adUnitId: '999' } } } },
      { id: '12', orderId: '5', name: 'LI soon', status: 'READY', startDateTime: d(2026, 12, 1), endDateTime: d(2026, 12, 30), targeting: {} },
      { id: '13', orderId: '5', name: 'LI far', status: 'READY', startDateTime: d(2027, 2, 1), endDateTime: d(2027, 2, 28), targeting: {} },
    ],
    licas: [{ lineItemId: '10', creativeId: '100' }, { lineItemId: '11', creativeId: '101' }, { lineItemId: '12', creativeId: '100' }, { lineItemId: '13', creativeId: '100' }],
    creatives: [
      { id: '100', name: 'Banner', _type: 'ImageCreative', size: { width: '970', height: '250' }, primaryImageAsset: { assetUrl: 'https://i/1.jpg' }, destinationUrl: 'https://c' },
      { id: '101', name: 'Rect', _type: 'Html5Creative', size: { width: '300', height: '250' }, html5Asset: { assetUrl: 'https://z' } },
    ],
    orders: [{ id: '5', name: 'Order', advertiserId: '7' }],
    companies: [{ id: '7', name: 'ลูกค้า A' }],
  });
  assert.strictEqual(items.length, 3); // far-future (>30 days) dropped
  assert.strictEqual(items.find((i) => i.lineItemId === '12').upcoming, true);
  assert.strictEqual(items.find((i) => i.lineItemId === '10').upcoming, false);
  const lb = items.find((i) => i.lineItemId === '10');
  assert.deepStrictEqual(lb.slots, ['leaderboard', 'postarticle']);
  assert.strictEqual(lb.slotGuessed, false);
  assert.deepStrictEqual(lb.categories, ['crime']);
  assert.strictEqual(lb.advertiser, 'ลูกค้า A');
  const h5 = items.find((i) => i.lineItemId === '11');
  assert.strictEqual(h5.type, 'html5');
  assert.deepStrictEqual(h5.slots, ['sticky']);
  assert.strictEqual(h5.slotGuessed, true);
  assert.match(h5.url, /^\/h5\/101\/[\w-]{22}\/$/);
});

t('todayBangkok uses UTC+7', () => {
  assert.strictEqual(todayBangkok(new Date('2026-11-10T17:30:00Z')), '2026-11-11');
});

t('sign.clean: one per slot, https only, html5 made absolute', () => {
  const out = clean([
    { slot: 'sticky', type: 'img', url: 'https://a/1.jpg', w: 300, h: 250, clickUrl: 'javascript:alert(1)' },
    { slot: 'sticky', type: 'img', url: 'https://a/2.jpg' },
    { slot: 'leaderboard', type: 'img', url: 'http://insecure' },
    { slot: 'postarticle', type: 'html5', url: '/h5/1/abc/' },
  ], 'https://app.vercel.app');
  assert.deepStrictEqual(out.map((o) => o.s), ['sticky', 'postarticle']);
  assert.strictEqual(out[0].c, '');
  assert.strictEqual(out[1].u, 'https://app.vercel.app/h5/1/abc/');
});

t('zip reader: deflate + stored, entry html', () => {
  // build a tiny zip by hand
  const files = [['banner/index.html', Buffer.from('<html>hi</html>'), 8], ['banner/a.js', Buffer.from('x=1'), 0]];
  const locals = [], centrals = []; let off = 0;
  for (const [name, raw, method] of files) {
    const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nb, data); centrals.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  const z = readZip(Buffer.concat([...locals, cd, e]));
  assert.strictEqual(entryHtml(z.names), 'banner/index.html');
  assert.strictEqual(z.get('banner/index.html').toString(), '<html>hi</html>');
  assert.strictEqual(z.get('banner/a.js').toString(), 'x=1');
});

console.log(`\n${n} tests passed`);
