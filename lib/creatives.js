// Builds the list of creatives that are active in GAM today.
const { query, byIds, chunk } = require('./gam');
const { arr } = require('./xml');
const slots = require('../config/slots.json');
const pages = require('../config/pages.json');
const { hmac } = require('./sign');

const SLOT_BY_UNIT = Object.fromEntries(slots.map((s) => [s.adUnitId, s.slot]));
const CATEGORY_PAGES = new Set(pages.filter((p) => p.category).map((p) => p.category));

// GAM DateTime → "YYYY-MM-DD" (in the line item's own timezone, good enough for a date check)
function ymd(dt) {
  if (!dt || !dt.date) return null;
  const d = dt.date;
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}
function todayBangkok(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
}

// Pure mapping from raw GAM objects → app items. Exported for tests.
const UPCOMING_DAYS = 30;
const addDays = (ymdStr, n) => new Date(Date.parse(ymdStr + 'T00:00:00Z') + n * 86400e3).toISOString().slice(0, 10);

function buildItems({ lineItems, licas, creatives, orders, companies, today, h5Secret }) {
  const horizon = addDays(today, UPCOMING_DAYS);
  const liById = new Map(lineItems.map((l) => [String(l.id), l]));
  const crById = new Map(creatives.map((c) => [String(c.id), c]));
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  const coById = new Map(companies.map((c) => [String(c.id), c]));
  const out = [];
  for (const a of licas) {
    const li = liById.get(String(a.lineItemId));
    const cr = crById.get(String(a.creativeId));
    if (!li || !cr) continue;
    const start = ymd(li.startDateTime), end = ymd(li.endDateTime);
    if (start && start > horizon) continue;
    const upcoming = !!start && start > today;
    if (end && String(li.unlimitedEndDateTime) !== 'true' && end < today) continue;

    const type = cr._type === 'ImageCreative' ? 'img' : cr._type === 'Html5Creative' ? 'html5' : null;
    const size = cr.size || {};
    const w = +size.width || 0, h = +size.height || 0;
    const units = arr(li.targeting && li.targeting.inventoryTargeting && li.targeting.inventoryTargeting.targetedAdUnits)
      .map((u) => String(u.adUnitId));
    let targetSlots = [...new Set(units.map((u) => SLOT_BY_UNIT[u]).filter(Boolean))];
    const guessed = !targetSlots.length;
    if (guessed) targetSlots = [w >= 728 ? 'leaderboard' : 'sticky'];

    const order = orderById.get(String(li.orderId)) || {};
    const company = coById.get(String(order.advertiserId)) || {};
    const asset = type === 'img' ? cr.primaryImageAsset : type === 'html5' ? cr.html5Asset : null;

    out.push({
      creativeId: String(cr.id),
      creativeName: cr.name,
      type,
      supported: !!type,
      w, h,
      url: type === 'img' ? (asset && asset.assetUrl) : type === 'html5' ? `/h5/${cr.id}/${hmac(h5Secret, 'h5:' + cr.id).slice(0, 22)}/` : null,
      clickUrl: cr.destinationUrl || '',
      lineItemId: String(li.id),
      lineItemName: li.name,
      lineItemStatus: li.status,
      upcoming,
      start, end: String(li.unlimitedEndDateTime) === 'true' ? null : end,
      orderId: String(li.orderId),
      orderName: order.name || '',
      advertiser: company.name || '(ไม่ทราบลูกค้า)',
      slots: targetSlots,
      slotGuessed: guessed,
      categories: categoriesFrom(li.targeting),
    });
  }
  out.sort((a, b) => a.advertiser.localeCompare(b.advertiser, 'th') || a.lineItemName.localeCompare(b.lineItemName, 'th'));
  return out;
}

// Pull custom-targeting category values when they are present as plain values (best effort).
function categoriesFrom(t) {
  const found = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    for (const v of Object.values(n)) {
      if (typeof v === 'string' && CATEGORY_PAGES.has(v)) found.add(v);
      else walk(v);
    }
  })(t && t.customTargeting);
  return [...found];
}

async function fetchActive({ h5Secret }) {
  const today = todayBangkok();
  const lineItems = await query('LineItemService', 'getLineItemsByStatement', "WHERE status IN ('DELIVERING','READY')");
  const liIds = lineItems.map((l) => l.id);
  const licas = [];
  for (const c of chunk(liIds, 400)) {
    if (c.length) licas.push(...await query('LineItemCreativeAssociationService', 'getLineItemCreativeAssociationsByStatement',
      `WHERE lineItemId IN (${c.join(',')}) AND status = 'ACTIVE'`));
  }
  const creatives = licas.length ? await byIds('CreativeService', 'getCreativesByStatement', licas.map((a) => a.creativeId)) : [];
  const orders = liIds.length ? await byIds('OrderService', 'getOrdersByStatement', lineItems.map((l) => l.orderId)) : [];
  const companies = orders.length ? await byIds('CompanyService', 'getCompaniesByStatement', orders.map((o) => o.advertiserId)) : [];
  return { today, items: buildItems({ lineItems, licas, creatives, orders, companies, today, h5Secret }) };
}

module.exports = { fetchActive, buildItems, todayBangkok, UPCOMING_DAYS };
