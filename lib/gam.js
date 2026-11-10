// Google Ad Manager SOAP client (read-only, no dependencies).
const crypto = require('crypto');
const { parse, arr } = require('./xml');
const { b64u } = require('./sign');

const VERSION = process.env.GAM_API_VERSION || 'v202608';
const SCOPE = 'https://www.googleapis.com/auth/dfp';
let tokenCache = null;

function serviceAccount() {
  const raw = process.env.GAM_KEY;
  if (!raw) throw new Error('GAM_KEY is not set');
  return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}

async function accessToken() {
  if (tokenCache && tokenCache.exp > Date.now() + 60000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('OAuth failed: ' + JSON.stringify(j));
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function call(service, method, bodyXml) {
  const ns = `https://www.google.com/apis/ads/publisher/${VERSION}`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="${ns}">
<soapenv:Header><RequestHeader><networkCode>${esc(process.env.GAM_NETWORK)}</networkCode><applicationName>dn-ad-preview</applicationName></RequestHeader></soapenv:Header>
<soapenv:Body><${method}>${bodyXml}</${method}></soapenv:Body></soapenv:Envelope>`;
  const r = await fetch(`https://ads.google.com/apis/ads/publisher/${VERSION}/${service}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', Authorization: `Bearer ${await accessToken()}`, SOAPAction: '""' },
    body: envelope,
  });
  const text = await r.text();
  const doc = parse(text);
  const body = doc.Envelope && doc.Envelope.Body;
  if (!r.ok || (body && body.Fault)) {
    const f = body && body.Fault;
    throw new Error(`${service}.${method} ${r.status}: ${f ? f.faultstring : text.slice(0, 300)}`);
  }
  return body[`${method}Response`] && body[`${method}Response`].rval;
}

// Run a PQL statement with paging; returns all results.
async function query(service, method, where) {
  const out = [];
  const PAGE = 500;
  for (let offset = 0; ; offset += PAGE) {
    const rval = await call(service, method, `<filterStatement><query>${esc(`${where} LIMIT ${PAGE} OFFSET ${offset}`)}</query></filterStatement>`);
    const rows = arr(rval && rval.results);
    out.push(...rows);
    const total = +(rval && rval.totalResultSetSize) || 0;
    if (offset + PAGE >= total || !rows.length) break;
  }
  return out;
}

const chunk = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
async function byIds(service, method, ids, extra = '') {
  const out = [];
  for (const c of chunk([...new Set(ids)], 400)) out.push(...await query(service, method, `WHERE id IN (${c.join(',')})${extra}`));
  return out;
}

module.exports = { call, query, byIds, chunk };
