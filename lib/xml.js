// Minimal XML → object parser for GAM SOAP responses (no dependencies).
// - namespace prefixes are stripped
// - repeated child tags become arrays; use arr() to normalise
// - xsi:type is kept as "_type"; other attributes are ignored
function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
const local = (n) => n.slice(n.indexOf(':') + 1);

function parse(xml) {
  const root = { children: {} };
  const stack = [root];
  const re = /<(\/?)([\w.:-]+)([^>]*?)(\/?)>|([^<]+)|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined || m[6] !== undefined) {
      const t = m[6] !== undefined ? m[6] : decode(m[5]);
      if (t.trim()) top.text = (top.text || '') + t;
      continue;
    }
    if (!m[2]) continue;
    if (m[1]) { // close
      const node = stack.pop();
      const parent = stack[stack.length - 1];
      add(parent, local(m[2]), finish(node));
      continue;
    }
    const node = { children: {} };
    const tm = /\btype="(?:[\w-]+:)?([\w-]+)"/.exec(m[3]);
    if (tm) node.type = tm[1];
    if (m[4]) add(top, local(m[2]), finish(node));
    else stack.push(node);
  }
  return finish(root);
}

function finish(node) {
  const keys = Object.keys(node.children);
  if (!keys.length && !node.type) return node.text !== undefined ? node.text : '';
  const o = {};
  for (const k of keys) o[k] = node.children[k];
  if (node.type) o._type = node.type;
  if (node.text !== undefined && !keys.length) o._text = node.text;
  return o;
}

function add(parent, name, value) {
  const c = parent.children;
  if (!(name in c)) c[name] = value;
  else if (Array.isArray(c[name]) && c[name]._multi) c[name].push(value);
  else { const a = [c[name], value]; a._multi = true; c[name] = a; }
}

const arr = (v) => (v === undefined || v === null || v === '' ? [] : Array.isArray(v) ? v : [v]);

module.exports = { parse, arr };
