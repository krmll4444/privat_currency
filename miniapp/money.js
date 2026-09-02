export function planEurPurchase({
  eurAmount,
  businessUsdBuy,
  p24EurSale,
  marketUsd,
  marketEur,
}) {
  if (!eurAmount || !businessUsdBuy || !p24EurSale) return null;

  const uahNeeded = eurAmount * p24EurSale;
  const usdFop = uahNeeded / businessUsdBuy;
  const usdNbu =
    marketUsd && marketEur ? (eurAmount * marketEur) / marketUsd : null;
  const extraUsd = usdNbu != null ? usdFop - usdNbu : null;
  const extraUah = extraUsd != null ? extraUsd * businessUsdBuy : null;
  const lossPct = usdNbu ? (usdFop / usdNbu - 1) * 100 : null;

  return { eurAmount, usdFop, usdNbu, uahNeeded, extraUsd, extraUah, lossPct };
}

export function fmt(n, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("uk-UA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
}

export function percentileRank(value, values) {
  const nums = values.filter((v) => v != null && !Number.isNaN(v));
  if (!nums.length || value == null) return null;
  const below = nums.filter((v) => v < value).length;
  return (below / nums.length) * 100;
}

export function cutoffMs(range) {
  const now = Date.now();
  if (range === "24h") return now - 24 * 3600 * 1000;
  if (range === "7d") return now - 7 * 24 * 3600 * 1000;
  if (range === "30d") return now - 30 * 24 * 3600 * 1000;
  if (range === "90d") return now - 90 * 24 * 3600 * 1000;
  return 0;
}

export function toCandles(points, intervalSec) {
  const buckets = new Map();
  for (const point of points) {
    if (point.value == null || Number.isNaN(point.value)) continue;
    const time = Math.floor(point.time / intervalSec) * intervalSec;
    const prev = buckets.get(time);
    if (!prev) {
      buckets.set(time, {
        time,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
      });
    } else {
      prev.high = Math.max(prev.high, point.value);
      prev.low = Math.min(prev.low, point.value);
      prev.close = point.value;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function extrema(candles, { peaks, window = 2, limit = 10 }) {
  if (candles.length < window * 2 + 1) return [];
  const hits = [];
  for (let i = window; i < candles.length - window; i += 1) {
    const v = candles[i].close;
    let ok = true;
    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      if (peaks ? candles[j].close > v : candles[j].close < v) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  hits.sort((a, b) =>
    peaks ? candles[b].close - candles[a].close : candles[a].close - candles[b].close,
  );
  return hits.slice(0, limit);
}

export function deltaHistogram(candles) {
  return candles.map((c, i) => {
    const prev = i === 0 ? c.open : candles[i - 1].close;
    const delta = c.close - prev;
    return {
      time: c.time,
      value: delta,
      color: delta >= 0 ? "rgba(34, 197, 94, 0.45)" : "rgba(239, 68, 68, 0.45)",
    };
  });
}

export function usdMarkers(candles) {
  const markers = [];
  for (const i of extrema(candles, { peaks: true })) {
    markers.push({
      time: candles[i].time,
      position: "aboveBar",
      color: "#22c55e",
      shape: "arrowUp",
      text: "Продаж USD",
    });
  }
  candles.forEach((c, i) => {
    if (i === 0) return;
    const delta = c.close - candles[i - 1].close;
    if (Math.abs(delta) < 0.01) return;
    if (markers.some((m) => m.time === c.time)) return;
    markers.push({
      time: c.time,
      position: delta > 0 ? "aboveBar" : "belowBar",
      color: "#64748b",
      shape: delta > 0 ? "arrowUp" : "arrowDown",
    });
  });
  return markers.sort((a, b) => a.time - b.time);
}

export function eurMarkers(candles) {
  const markers = [];
  for (const i of extrema(candles, { peaks: false })) {
    markers.push({
      time: candles[i].time,
      position: "belowBar",
      color: "#22c55e",
      shape: "arrowDown",
      text: "Купівля EUR",
    });
  }
  candles.forEach((c, i) => {
    if (i === 0) return;
    const delta = c.close - candles[i - 1].close;
    if (Math.abs(delta) < 0.01) return;
    if (markers.some((m) => m.time === c.time)) return;
    markers.push({
      time: c.time,
      position: delta < 0 ? "belowBar" : "aboveBar",
      color: "#64748b",
      shape: delta < 0 ? "arrowDown" : "arrowUp",
    });
  });
  return markers.sort((a, b) => a.time - b.time);
}

export function edgeMarkers(candles) {
  const markers = [];
  for (const i of extrema(candles, { peaks: true })) {
    markers.push({
      time: candles[i].time,
      position: "aboveBar",
      color: "#22c55e",
      shape: "arrowUp",
      text: "Кращий спред",
    });
  }
  return markers;
}

export function analyze(rows, latest) {
  const usd = rows.map((r) => r.business?.USD?.buy).filter((v) => v != null);
  const eur = rows.map((r) => r.p24?.EUR?.sale).filter((v) => v != null);
  const nowUsd = latest.business?.USD?.buy;
  const nowEur = latest.p24?.EUR?.sale;
  const usdRank = percentileRank(nowUsd, usd);
  const eurRank = percentileRank(nowEur, eur);
  const notes = [];

  if (rows.some((r) => r.backfill || r.p24Estimated)) {
    notes.push(
      "USD ФОП — з архіву otp24 (робочі дні). Карткового архіву P24 немає, тож EUR sale оцінений: курс ФОП × поточна націнка картки.",
    );
  }

  if (rows.length < 8) {
    notes.push(
      "Історії ще мало — після кількох оновлень cron з’являться свічки, койли і надійніший аналіз.",
    );
  }

  if (usdRank != null) {
    const sellNow = usdRank >= 70;
    notes.push(
      sellNow
        ? `USD: купівля ФОП ${nowUsd.toFixed(4)} — вище за ${usdRank.toFixed(0)}% історії. Зараз вигідно продавати долар (більше гривень).`
        : `USD: купівля ФОП ${nowUsd.toFixed(4)} — лише ${usdRank.toFixed(0)}-й перцентиль. Можна почекати вищий курс продажу.`,
    );
  }

  if (eurRank != null) {
    const buyNow = eurRank <= 30;
    notes.push(
      buyNow
        ? `EUR: продаж P24 ${nowEur.toFixed(4)} — дешевше, ніж у ${(100 - eurRank).toFixed(0)}% історії. Зараз вигідно купувати євро.`
        : `EUR: продаж P24 ${nowEur.toFixed(4)} — дорожче за ${eurRank.toFixed(0)}% історії. Купівля зараз відносно дорога.`,
    );
  }

  if (usdRank != null && eurRank != null && usdRank >= 70 && eurRank <= 30) {
    notes.push("Обидва боки збіглись: і продаж USD, і купівля EUR зараз в історично вигідній зоні.");
  } else if (latest.spread?.favorable) {
    notes.push("Ланцюжок USD→EUR зараз у межах твого порогу вигідності.");
  }

  return notes;
}
