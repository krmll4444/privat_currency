/**
 * EUR/USD крос (як на Investing): скільки USD за 1 EUR.
 * Джерела: Yahoo (майже live) → open.er-api → Frankfurter (ECB) → НБУ.
 */

const UA = "PrivatRateEngine/1.0 (github.com; cron; +https://github.com)";

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", ...headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} → HTTP ${res.status} ${body.slice(0, 160)}`);
  }
  return res.json();
}

/** USD за 1 EUR через ланцюжок Приват: EUR sale / USD buy. */
export function privatEurUsd(businessUsdBuy, p24EurSale) {
  if (!businessUsdBuy || !p24EurSale) return null;
  return p24EurSale / businessUsdBuy;
}

/** USD за 1 EUR за НБУ. */
export function nbuEurUsd(nbuUsd, nbuEur) {
  if (!nbuUsd || !nbuEur) return null;
  return nbuEur / nbuUsd;
}

export function toPips(delta) {
  if (delta == null || Number.isNaN(delta)) return null;
  return Math.round(delta * 10000);
}

export function kyivHour(ts = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

/** Нічне вікно банку: з 22:00 до 10:00 за Києвом. */
export function isNightWindow(ts = Date.now(), { startHour = 22, endHour = 10 } = {}) {
  const h = kyivHour(ts);
  return h >= startHour || h < endHour;
}

async function fetchYahooEurUsd() {
  const data = await getJson(
    "https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1m&range=1d",
    { "User-Agent": "Mozilla/5.0" },
  );
  const meta = data?.chart?.result?.[0]?.meta;
  const rate = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Yahoo: немає EURUSD");
  return {
    eurUsd: rate,
    prevClose: Number(meta?.previousClose) || null,
    source: "yahoo",
    asOf: meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

async function fetchOpenErEurUsd() {
  const data = await getJson("https://open.er-api.com/v6/latest/EUR");
  const rate = Number(data?.rates?.USD);
  if (data?.result !== "success" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("open.er-api: немає EURUSD");
  }
  return {
    eurUsd: rate,
    prevClose: null,
    source: "open.er-api",
    asOf: data.time_last_update_utc
      ? new Date(data.time_last_update_utc).toISOString()
      : new Date().toISOString(),
  };
}

async function fetchFrankfurterEurUsd() {
  const data = await getJson("https://api.frankfurter.dev/v2/rate/EUR/USD");
  const rate = Number(data?.rate);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Frankfurter: немає EURUSD");
  return {
    eurUsd: rate,
    prevClose: null,
    source: "frankfurter",
    asOf: data.date ? `${data.date}T12:00:00.000Z` : new Date().toISOString(),
  };
}

export async function fetchMarketEurUsd() {
  const errors = [];
  for (const fn of [fetchYahooEurUsd, fetchOpenErEurUsd, fetchFrankfurterEurUsd]) {
    try {
      return await fn();
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  throw new Error(`EURUSD: усі джерела впали. ${errors.join(" | ")}`);
}

export function buildCrossSnapshot({
  market,
  businessUsdBuy,
  p24EurSale,
  nbuUsd,
  nbuEur,
  prevPrivatEurUsd = null,
  prevMarketEurUsd = null,
  ts = Date.now(),
  nightStartHour = 22,
  nightEndHour = 10,
} = {}) {
  const privat = privatEurUsd(businessUsdBuy, p24EurSale);
  const nbu = nbuEurUsd(nbuUsd, nbuEur);
  const eurUsd = market?.eurUsd ?? nbu;
  const lag = privat != null && eurUsd != null ? privat - eurUsd : null;
  const lagPct = lag != null && eurUsd ? (lag / eurUsd) * 100 : null;
  const night = isNightWindow(ts, { startHour: nightStartHour, endHour: nightEndHour });

  const marketMove =
    eurUsd != null && prevMarketEurUsd != null ? eurUsd - prevMarketEurUsd : null;
  const privatMove =
    privat != null && prevPrivatEurUsd != null ? privat - prevPrivatEurUsd : null;

  let follow = "unknown";
  let followHint = null;
  if (night) {
    follow = "night-buffer";
    followHint =
      "Нічне вікно (22:00–10:00 Київ): Приват зазвичай тримає зазор і майже не ганяється за кросом.";
  } else if (marketMove != null && privatMove != null) {
    const mPips = Math.abs(toPips(marketMove));
    const pPips = Math.abs(toPips(privatMove));
    if (mPips >= 15 && pPips <= 5) {
      follow = "stale";
      followHint = `Ринок зрушив на ${toPips(marketMove)} п., Приват майже стоїть (${toPips(privatMove)} п.).`;
    } else if (mPips >= 10 && Math.sign(marketMove) === Math.sign(privatMove) && pPips >= 5) {
      follow = "tracking";
      followHint = "Приват рухається в бік кросу.";
    } else if (mPips < 10 && pPips < 10) {
      follow = "quiet";
      followHint = "І крос, і Приват майже стоять.";
    } else {
      follow = "mixed";
      followHint = `Крос ${toPips(marketMove)} п., Приват ${toPips(privatMove)} п.`;
    }
  }

  return {
    eurUsd: eurUsd == null ? null : Math.round(eurUsd * 1e5) / 1e5,
    prevClose: market?.prevClose == null ? null : Math.round(market.prevClose * 1e5) / 1e5,
    source: market?.source || (nbu != null ? "nbu" : null),
    asOf: market?.asOf || null,
    nbuEurUsd: nbu == null ? null : Math.round(nbu * 1e5) / 1e5,
    privatEurUsd: privat == null ? null : Math.round(privat * 1e5) / 1e5,
    lagPct: lagPct == null ? null : Math.round(lagPct * 100) / 100,
    lagPips: lag == null ? null : toPips(lag),
    nightWindow: night,
    follow,
    followHint,
    marketMovePips: marketMove == null ? null : toPips(marketMove),
    privatMovePips: privatMove == null ? null : toPips(privatMove),
  };
}

/**
 * Окремі тригери по кросу. Не змішуються з sell-usd / buy-eur.
 * drop — крос просів на CROSS_DROP_PIPS від останнього зафіксованого.
 * near-floor — підійшов до CROSS_NEAR (типово 1.135).
 * floor — на/нижче CROSS_FLOOR (типово 1.13).
 * privat-stale — вдень ринок пішов вниз, Приват майже не рухнув.
 */
export function crossNotifyKinds(
  cross,
  state = {},
  {
    floor = 1.13,
    nearFloor = 1.135,
    dropPips = 20,
    staleMarketDropPips = 25,
  } = {},
) {
  const kinds = [];
  const rate = cross?.eurUsd;
  if (rate == null) return kinds;

  const moveDown = -(cross.marketMovePips ?? 0);
  const vsLast =
    state.lastCrossRate != null ? toPips(state.lastCrossRate - rate) : 0;
  if (moveDown >= dropPips || vsLast >= dropPips) {
    kinds.push("cross-drop");
  }

  if (rate <= floor) kinds.push("cross-floor");
  else if (rate <= nearFloor) kinds.push("cross-near");

  if (
    !cross?.nightWindow &&
    cross?.follow === "stale" &&
    (cross.marketMovePips ?? 0) <= -staleMarketDropPips
  ) {
    kinds.push("privat-stale");
  }

  return kinds;
}

export function shouldNotifyCross(cross, state, cooldownHours, opts = {}) {
  const kinds = crossNotifyKinds(cross, state, opts);
  if (!kinds.length) return { send: false, reason: "quiet", kinds };

  const lastAt = state.lastCrossNotifyAt ? Date.parse(state.lastCrossNotifyAt) : 0;
  const cooldownMs = cooldownHours * 3600 * 1000;
  const cooled = !lastAt || Date.now() - lastAt >= cooldownMs;
  const lastKinds = new Set(state.lastCrossKinds || []);
  const fresh = kinds.filter((k) => !lastKinds.has(k));

  // floor / near — важливіші: пробивають кулдаун, якщо ще не слали цей рівень
  const levelFresh = fresh.filter((k) => k === "cross-floor" || k === "cross-near");
  if (levelFresh.length) return { send: true, reason: levelFresh[0], kinds };
  if (cooled) return { send: true, reason: kinds[0], kinds };
  if (fresh.length) return { send: true, reason: fresh[0], kinds: fresh };
  return { send: false, reason: "cooldown", kinds };
}

export function formatCrossAlert(snapshot) {
  const c = snapshot.cross || {};
  const rate = c.eurUsd;
  const sign = (n) => (n > 0 ? "+" : "");
  const title =
    rate != null && rate <= (snapshot.crossFloor ?? 1.13)
      ? `EUR/USD ≤ ${snapshot.crossFloor ?? 1.13}`
      : rate != null && rate <= (snapshot.crossNear ?? 1.135)
        ? `EUR/USD біля ${snapshot.crossFloor ?? 1.13}`
        : "EUR/USD просів";

  return [
    `<b>${title}</b>`,
    "",
    `Крос EUR/USD: <b>${rate == null ? "—" : rate.toFixed(4)}</b> (${c.source || "—"})`,
    c.prevClose != null ? `Prev close: ${c.prevClose.toFixed(4)}` : null,
    c.nbuEurUsd != null ? `НБУ крос: ${c.nbuEurUsd.toFixed(4)}` : null,
    c.privatEurUsd != null
      ? `Приват (EUR sale / USD buy): <b>${c.privatEurUsd.toFixed(4)}</b>`
      : null,
    c.lagPips != null
      ? `Зазор Приват vs ринок: <b>${sign(c.lagPips)}${c.lagPips} п.</b> (${sign(c.lagPct)}${Number(c.lagPct).toFixed(2)}%)`
      : null,
    c.nightWindow ? "⏱ Нічне вікно 22:00–10:00 — банк часто тримає буфер." : null,
    c.followHint || null,
  ]
    .filter((line) => line != null)
    .join("\n");
}
