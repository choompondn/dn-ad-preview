// Minimal ZIP reader (stored + deflate) for HTML5 creative bundles.
const zlib = require('zlib');

function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), cmtLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + cmtLen;
    if (name.endsWith('/')) continue;
    const lName = buf.readUInt16LE(local + 26), lExtra = buf.readUInt16LE(local + 28);
    const start = local + 30 + lName + lExtra;
    files.set(name, { method, data: buf.slice(start, start + csize) });
  }
  return {
    names: [...files.keys()],
    get(name) {
      const f = files.get(name);
      if (!f) return null;
      if (f.method === 0) return f.data;
      if (f.method === 8) return zlib.inflateRawSync(f.data);
      throw new Error('unsupported zip method ' + f.method);
    },
  };
}

// Pick the entry HTML: index.html at the shallowest level, else the first .html
function entryHtml(names) {
  const html = names.filter((n) => /\.html?$/i.test(n) && !n.startsWith('__MACOSX'));
  html.sort((a, b) => a.split('/').length - b.split('/').length || (/index\.html?$/i.test(b) - /index\.html?$/i.test(a)));
  return html[0] || null;
}

module.exports = { readZip, entryHtml };
