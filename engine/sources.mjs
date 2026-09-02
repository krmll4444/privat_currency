const P24_URL =
  "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11";
const MARKET_URL =
  "https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5";
const NBU_URL =
  "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json";
const BUSINESS_URL = "https://otp24.privatbank.ua/api/1/info/currency/get";
const BUSINESS_HISTORY_URL =
  "https://otp24.privatbank.ua/api/1/info/currency/history";
const BUSINESS_AUTOCLIENT_URL = "https://acp.privatbank.ua/api/proxy/currency/";

const UA =
  "PrivatRateEngine/1.0 (github.com; cron; +https://github.com)";

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} → HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

function fromPubinfo(rows) {
  const byCcy = {};
  for (const row of rows ?? []) {
    const ccy = row.ccy || row.currency;
    if (!ccy) continue;
    byCcy[ccy] = {
      buy: Number(row.buy ?? row.purchaseRate),
      sale: Number(row.sale ?? row.saleRate),
    };
  }
  return byCcy;
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Віджет логіну otp24: GET /api/1/info/currency/get (без токена).
 * Форма: { USD: { B: { rate }, S: { rate } }, EUR: { ... } }
 */
export function parseBusinessRates(data) {
  if (Array.isArray(data)) return fromPubinfo(data);

  const wrapped =
    data?.currencyRates || data?.rates || data?.exchangeRate || data?.currencies;
  if (Array.isArray(wrapped)) {
    return fromPubinfo(
      wrapped.map((row) => ({
        ccy: row.ccy || row.currency || row.Ccy,
        buy: row.buy ?? row.purchaseRate ?? row.B?.rate ?? row.b,
        sale: row.sale ?? row.saleRate ?? row.S?.rate ?? row.s,
      })),
    );
  }

  const out = {};
  for (const ccy of ["USD", "EUR"]) {
    const node = data?.[ccy] || data?.[ccy.toLowerCase()];
    if (!node) continue;
    const buy = num(node.B?.rate ?? node.buy ?? node.purchaseRate);
    const sale = num(node.S?.rate ?? node.sale ?? node.saleRate);
    if (buy != null || sale != null) out[ccy] = { buy, sale };
  }
  return out;
}

export async function fetchP24() {
  return fromPubinfo(await getJson(P24_URL));
}

export async function fetchMarketCash() {
  return fromPubinfo(await getJson(MARKET_URL));
}

export async function fetchNbu() {
  const rows = await getJson(NBU_URL);
  const out = {};
  for (const row of rows ?? []) {
    if (row.cc === "USD" || row.cc === "EUR") out[row.cc] = Number(row.rate);
  }
  return out;
}

export async function fetchBusiness() {
  const token = process.env.PRIVAT_BUSINESS_TOKEN;
  const headers = {
    Accept: "application/json",
    Referer: "https://otp24.privatbank.ua/",
  };
  let url = BUSINESS_URL;

  if (token) {
    url = BUSINESS_AUTOCLIENT_URL;
    headers.token = token;
    headers["Content-Type"] = "application/json;charset=utf8";
    if (process.env.PRIVAT_BUSINESS_ID) headers.id = process.env.PRIVAT_BUSINESS_ID;
  }

  const data = await getJson(url, headers);
  const parsed = parseBusinessRates(data);
  if (!parsed.USD?.buy || !parsed.EUR) {
    throw new Error(
      `Не вдалося розібрати курс Бізнес. Ключі: ${Object.keys(data || {}).join(", ")}`,
    );
  }
  parsed.source = token ? "acp.privatbank.ua/api/proxy/currency" : BUSINESS_URL;
  return parsed;
}

export async function fetchAll() {
  const [p24, market, nbu, business] = await Promise.all([
    fetchP24(),
    fetchMarketCash(),
    fetchNbu(),
    fetchBusiness(),
  ]);
  return { p24, market, nbu, business };
}

function uaDate(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const pick = (type) => parts.find((p) => p.type === type)?.value;
  return `${pick("day")}-${pick("month")}-${pick("year")}`;
}

export function parseOtp24History(payload) {
  const rows = payload?.data?.history || payload?.history || [];
  const byDate = new Map();
  for (const row of rows) {
    const ccy = row.currencyCode || row.ccy;
    if (ccy !== "USD" && ccy !== "EUR") continue;
    const day = byDate.get(row.date) || {};
    day[ccy] = {
      buy: num(row.rate_b ?? row.B?.rate),
      sale: num(row.rate_s ?? row.S?.rate),
      nbu: num(row.nbuRate ?? row.nbu),
    };
    byDate.set(row.date, day);
  }
  return byDate;
}

export async function fetchBusinessHistory({ sDate, eDate }) {
  const res = await fetch(BUSINESS_HISTORY_URL, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      Referer: "https://otp24.privatbank.ua/",
    },
    body: JSON.stringify({ sDate, eDate }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`otp24 history → HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return parseOtp24History(await res.json());
}

export { uaDate };
