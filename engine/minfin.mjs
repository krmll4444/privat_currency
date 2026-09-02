const UA = "PrivatRateEngine/1.0 (github.com; backfill; +https://github.com)";
const DAY_URL =
  "https://index.minfin.com.ua/ua/exchange/archive/privat";

export function parseMinfinNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseZebraTable(tableHtml) {
  const out = {};
  for (const row of tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripTags(m[1]),
    );
    const ccy = cells[0];
    if (ccy !== "USD" && ccy !== "EUR") continue;
    const buy = parseMinfinNumber(cells[2]);
    const sale = parseMinfinNumber(cells[5]);
    if (buy != null || sale != null) out[ccy] = { buy, sale };
  }
  return out;
}

export function parseMinfinPrivatHtml(html) {
  const cash = {};
  const card = {};
  for (const match of String(html).matchAll(
    /<table[^>]*class=['"]zebra['"][^>]*>([\s\S]*?)<\/table>/gi,
  )) {
    const table = match[1];
    const cap = stripTags(
      table.match(/<caption>([\s\S]*?)<\/caption>/i)?.[1] || "",
    );
    const rates = parseZebraTable(table);
    if (/картк/i.test(cap)) Object.assign(card, rates);
    else if (/готівк|відділен/i.test(cap)) Object.assign(cash, rates);
  }
  return { cash, card };
}

export function isoDays(start, end) {
  const days = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchMinfinPrivatDay(ymd) {
  const url = `${DAY_URL}/${ymd}/`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      "Accept-Language": "uk,en;q=0.8",
    },
  });
  if (res.status === 404) return { ymd, cash: {}, card: {} };
  if (!res.ok) {
    throw new Error(`minfin ${ymd} → HTTP ${res.status}`);
  }
  return { ymd, ...parseMinfinPrivatHtml(await res.text()) };
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

export async function fetchMinfinPrivatRange(start, end, { concurrency = 5 } = {}) {
  const days = isoDays(start, end);
  const byDay = new Map();
  const rows = await mapPool(days, concurrency, async (ymd) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt) await sleep(400 * attempt);
        return await fetchMinfinPrivatDay(ymd);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  });
  for (const row of rows) {
    byDay.set(row.ymd, { cash: row.cash, card: row.card });
  }
  return byDay;
}
