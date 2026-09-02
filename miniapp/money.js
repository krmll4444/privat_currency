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
      color: delta >= 0 ? "rgba(78, 165, 36, 0.45)" : "rgba(245, 61, 70, 0.45)",
    };
  });
}

export function toLine(candles) {
  return candles.map((c) => ({ time: c.time, value: c.close }));
}

/** profit > 0, zero ≈ 0, low-loss у межах порогу (ще мінус, але «вигідно»). */
export function sectorKind(edgePct, thresholdPct = -1, zeroEps = 0.05) {
  if (edgePct == null || Number.isNaN(edgePct)) return null;
  if (edgePct > zeroEps) return "profit";
  if (edgePct >= -zeroEps) return "zero";
  if (edgePct >= thresholdPct) return "low-loss";
  return null;
}

export function favorColor(kind) {
  if (kind === "profit") return "rgba(78, 165, 36, 0.32)";
  if (kind === "zero") return "rgba(255, 179, 0, 0.28)";
  if (kind === "low-loss") return "rgba(163, 232, 69, 0.28)";
  return "rgba(0, 0, 0, 0)";
}

export function relativeBestCutoff(values, fraction = 0.2) {
  const nums = values
    .filter((v) => v != null && !Number.isNaN(v))
    .sort((a, b) => b - a);
  if (!nums.length) return null;
  const i = Math.max(0, Math.ceil(nums.length * fraction) - 1);
  return nums[i];
}

export function favorHistogram(edgeCandles, thresholdPct = -1) {
  const cutoff = relativeBestCutoff(edgeCandles.map((c) => c.close));
  return edgeCandles.map((c) => {
    let kind = sectorKind(c.close, thresholdPct);
    if (!kind && cutoff != null && c.close >= cutoff) kind = "low-loss";
    return {
      time: c.time,
      value: kind ? 1 : 0,
      color: favorColor(kind),
    };
  });
}

export function snapByInterval(rows, intervalSec) {
  const buckets = new Map();
  for (const row of rows) {
    const ts = Date.parse(row.ts);
    if (!Number.isFinite(ts)) continue;
    const time = Math.floor(ts / 1000 / intervalSec) * intervalSec;
    buckets.set(time, row);
  }
  return buckets;
}

export function sectorHint(kind, row) {
  if (!kind || !row) return null;
  const edge = row.spread?.edgePct;
  const loss = row.spread?.lossPer1000UsdUah;
  const lossPct = row.spread?.lossPct;
  const usd = row.business?.USD?.buy;
  const eur = row.p24?.EUR?.sale;
  const lossTxt =
    loss == null ? "" : `Втрата на 1000$: ≈ ${Math.round(loss)} грн (${Number(lossPct).toFixed(2)}%).`;
  if (kind === "profit") {
    return {
      title: "Заробіток vs НБУ",
      text: `Ланцюжок кращий за НБУ на ${Number(edge).toFixed(2)}%. Вигідно продати USD на ФОП і купити EUR. ${lossTxt}`.trim(),
    };
  }
  if (kind === "zero") {
    return {
      title: "Майже паритет з НБУ",
      text: `Спред близько 0. Можна конвертувати без зайвої втрати. ${lossTxt} USD ${usd?.toFixed?.(2) ?? "—"} · EUR ${eur?.toFixed?.(2) ?? "—"}.`.trim(),
    };
  }
  return {
    title: "Мінімальна втрата",
    text: `Один з кращих моментів продати USD і купити EUR. Відхилення ${Number(edge).toFixed(2)}%. ${lossTxt}`.trim(),
  };
}

export function favorHints(edgeCandles, snaps, thresholdPct = -1) {
  const bars = favorHistogram(edgeCandles, thresholdPct);
  const out = new Map();
  for (const bar of bars) {
    if (!bar.value) continue;
    const row = snaps.get(bar.time);
    const kind = sectorKind(row?.spread?.edgePct, thresholdPct) || "low-loss";
    const hint = sectorHint(kind, row);
    if (hint) out.set(bar.time, hint);
  }
  return out;
}

export function applyRankFavorable(spread, historyEdges, topPct = 10) {
  const byThreshold = Boolean(spread.favorable);
  const nums = (historyEdges || []).filter((v) => v != null && !Number.isNaN(v));
  const rank = percentileRank(spread.edgePct, nums);
  const byTopDays =
    rank != null && nums.length >= 8 && topPct > 0 && rank >= 100 - topPct;
  return {
    ...spread,
    edgeRank: rank == null ? null : Math.round(rank * 10) / 10,
    byThreshold,
    byTopDays,
    favorable: byThreshold || byTopDays,
  };
}

export function costBit(plan) {
  if (plan?.extraUah == null || !plan.eurAmount) return "";
  return `Доплата ≈ ${Math.round(plan.extraUah)} грн на ${plan.eurAmount} EUR.`;
}

export function todayAdvice(latest, rows = [], { targetEur } = {}) {
  const spread = latest?.spread || {};
  const usd = rows.map((r) => r.business?.USD?.buy).filter((v) => v != null);
  const eur = rows.map((r) => r.p24?.EUR?.sale).filter((v) => v != null);
  const nowUsd = latest?.business?.USD?.buy;
  const nowEur = latest?.p24?.EUR?.sale;
  const usdRank = percentileRank(nowUsd, usd);
  const eurRank = percentileRank(nowEur, eur);
  const sellUsd = usdRank != null ? usdRank >= 70 : false;
  const buyEur = eurRank != null ? eurRank <= 30 : false;
  const chainOk = Boolean(spread.favorable);
  const amount = Number(targetEur || latest?.targetEur);
  const plan = planEurPurchase({
    eurAmount: amount,
    businessUsdBuy: nowUsd,
    p24EurSale: nowEur,
    marketUsd: latest?.nbu?.USD,
    marketEur: latest?.nbu?.EUR,
  });
  const extraBit =
    costBit(plan) ||
    (spread.lossPer1000UsdUah == null
      ? ""
      : `Втрата ≈ ${Math.round(spread.lossPer1000UsdUah)} грн на 1000$.`);

  let out;
  if (chainOk || (sellUsd && buyEur)) {
    out = {
      status: "do",
      sellUsd: true,
      buyEur: true,
      title: "Сьогодні вигідно",
      action: `Продай USD на ФОП і купи EUR у Приват24. ${extraBit}`.trim(),
    };
  } else if (sellUsd) {
    out = {
      status: "partial",
      sellUsd: true,
      buyEur: false,
      title: "Вигідно продати USD",
      action: `Продай долар на ФОП (курс високий). Євро поки не купуй — відносно дороге. ${extraBit}`.trim(),
    };
  } else if (buyEur) {
    out = {
      status: "partial",
      sellUsd: false,
      buyEur: true,
      title: "Вигідно купити EUR",
      action: `Купи євро в Приват24 (курс низький). USD на ФОП зараз слабкий — можна не продавати. ${extraBit}`.trim(),
    };
  } else {
    out = {
      status: "wait",
      sellUsd: false,
      buyEur: false,
      title: "Сьогодні не вигідно",
      action: `Не конвертуй USD→EUR. ${extraBit || "Зачекай кращий спред."}`.trim(),
    };
  }
  return { ...out, plan, extraUah: plan?.extraUah ?? null, targetEur: plan?.eurAmount ?? amount ?? null };
}

export function buildAdviceFile(snapshot, rows = [], targetEur) {
  const advice = todayAdvice(snapshot, rows, { targetEur });
  const plan = advice.plan;
  const profile = snapshot.profile;
  const round0 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n));
  const round2 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100);
  return {
    ts: snapshot.ts,
    status: advice.status,
    title: advice.title,
    action: advice.action,
    sellUsd: advice.sellUsd,
    buyEur: advice.buyEur,
    edgePct: snapshot.spread?.edgePct ?? null,
    favorable: Boolean(snapshot.spread?.favorable),
    byThreshold: Boolean(snapshot.spread?.byThreshold),
    byTopDays: Boolean(snapshot.spread?.byTopDays),
    edgeRank: snapshot.spread?.edgeRank ?? null,
    thresholdPct: snapshot.thresholdPct ?? null,
    targetEur: plan?.eurAmount ?? targetEur ?? null,
    extraUah: profile?.extraUah ?? round0(plan?.extraUah),
    extraUsd: profile?.extraUsd ?? round2(plan?.extraUsd),
    usdFop: profile?.usdFop ?? round2(plan?.usdFop),
    uahNeeded: profile?.uahNeeded ?? round0(plan?.uahNeeded),
    businessUsdBuy: snapshot.business?.USD?.buy ?? null,
    p24EurSale: snapshot.p24?.EUR?.sale ?? null,
    chainEurPerUsd: snapshot.spread?.chainEurPerUsd ?? null,
    marketEurPerUsd: snapshot.spread?.marketEurPerUsd ?? null,
    lossPer1000UsdUah: snapshot.spread?.lossPer1000UsdUah ?? null,
  };
}

export function usdMarkers(candles) {
  const markers = [];
  for (const i of extrema(candles, { peaks: true })) {
    markers.push({
      time: candles[i].time,
      position: "aboveBar",
      color: "#4ea524",
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
      color: "#a3acae",
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
      color: "#4ea524",
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
      color: "#a3acae",
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
      color: "#4ea524",
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
  const advice = todayAdvice(latest, rows, { targetEur: latest.targetEur });

  notes.push({ text: `${advice.title}. ${advice.action}`, tone: advice.status === "wait" ? "wait" : advice.sellUsd && advice.buyEur ? "both" : advice.sellUsd ? "sell" : advice.buyEur ? "buy" : "info" });

  if (rows.some((r) => r.backfill)) {
    const estimated = rows.filter((r) => r.p24Estimated).length;
    notes.push({
      tone: "info",
      text: estimated
        ? `Бекфіл: USD ФОП з otp24, картка P24 з архіву Minfin. ${estimated} днів без картки — оцінка націнкою.`
        : "Бекфіл: USD ФОП з otp24 (робочі дні), картковий EUR — з архіву Minfin (курс Приват24).",
    });
  }

  if (rows.length < 8) {
    notes.push({
      tone: "info",
      text: "Історії ще мало — після кількох оновлень cron з’являться свічки, койли і надійніший аналіз.",
    });
  }

  if (usdRank != null) {
    const sellNow = usdRank >= 70;
    notes.push({
      tone: sellNow ? "sell" : "wait",
      text: sellNow
        ? `USD: купівля ФОП ${nowUsd.toFixed(4)} — вище за ${usdRank.toFixed(0)}% історії. Зараз вигідно продавати долар (більше гривень).`
        : `USD: купівля ФОП ${nowUsd.toFixed(4)} — лише ${usdRank.toFixed(0)}-й перцентиль. Можна почекати вищий курс продажу.`,
    });
  }

  if (eurRank != null) {
    const buyNow = eurRank <= 30;
    notes.push({
      tone: buyNow ? "buy" : "wait",
      text: buyNow
        ? `EUR: продаж P24 ${nowEur.toFixed(4)} — дешевше, ніж у ${(100 - eurRank).toFixed(0)}% історії. Зараз вигідно купувати євро.`
        : `EUR: продаж P24 ${nowEur.toFixed(4)} — дорожче за ${eurRank.toFixed(0)}% історії. Купівля зараз відносно дорога.`,
    });
  }

  if (usdRank != null && eurRank != null && usdRank >= 70 && eurRank <= 30) {
    notes.push({
      tone: "both",
      text: "Обидва боки збіглись: і продаж USD, і купівля EUR зараз в історично вигідній зоні.",
    });
  } else if (latest.spread?.favorable) {
    notes.push({
      tone: "both",
      text: "Ланцюжок USD→EUR зараз у межах твого порогу вигідності.",
    });
  }

  return notes;
}
