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

export function kyivYmd(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

export function daysUntil(isoDate, now = Date.now()) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const today = kyivYmd(now);
  return Math.round(
    (Date.parse(`${isoDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
  );
}

export function daysWord(n) {
  const abs = Math.abs(n);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} дні`;
  return `${n} днів`;
}

export function sideSignals(latest, rows = [], { usdPct = 70, eurPct = 30 } = {}) {
  const usd = rows.map((r) => r.business?.USD?.buy).filter((v) => v != null);
  const eur = rows.map((r) => r.p24?.EUR?.sale).filter((v) => v != null);
  const usdRank = percentileRank(latest?.business?.USD?.buy, usd);
  const eurRank = percentileRank(latest?.p24?.EUR?.sale, eur);
  return {
    usdRank: usdRank == null ? null : Math.round(usdRank * 10) / 10,
    eurRank: eurRank == null ? null : Math.round(eurRank * 10) / 10,
    sellUsd: usdRank != null && usdRank >= usdPct,
    buyEur: eurRank != null && eurRank <= eurPct,
  };
}

function dayBaseline(rows, nowTs) {
  const today = kyivYmd(nowTs);
  const dated = rows
    .filter((r) => r.ts && r.spread?.edgePct != null)
    .map((r) => ({ row: r, ts: Date.parse(r.ts), day: kyivYmd(Date.parse(r.ts)) }))
    .filter((x) => Number.isFinite(x.ts))
    .sort((a, b) => a.ts - b.ts);
  const todays = dated.filter((x) => x.day === today);
  if (todays.length) return todays[0].row;
  const prev = dated.filter((x) => x.day < today);
  return prev.length ? prev[prev.length - 1].row : null;
}

export function dayDeltaPct(latest, rows = []) {
  const nowTs = Date.parse(latest?.ts) || Date.now();
  const past = rows.filter((r) => r.ts !== latest?.ts);
  const base = dayBaseline(past, nowTs);
  if (base?.spread?.edgePct == null || latest?.spread?.edgePct == null) return null;
  return Math.round((latest.spread.edgePct - base.spread.edgePct) * 100) / 100;
}

export function dailyBestEdges(rows = []) {
  const byDay = new Map();
  for (const row of rows) {
    if (row.spread?.edgePct == null || !row.ts) continue;
    const ts = Date.parse(row.ts);
    if (!Number.isFinite(ts)) continue;
    const day = kyivYmd(ts);
    const prev = byDay.get(day);
    if (prev == null || row.spread.edgePct > prev) byDay.set(day, row.spread.edgePct);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, edgePct]) => ({ date, edgePct }));
}

export function waitHorizon({ edgePct, daysLeft, dailyEdges = [], improvePp = 0.3 } = {}) {
  if (daysLeft == null) return null;
  const left = daysWord(daysLeft);
  if (daysLeft < 0) {
    return { wait: false, text: `Цільова дата вже минула (${left} тому).` };
  }
  if (daysLeft === 0) {
    return { wait: false, text: "Сьогодні цільова дата — краще конвертувати зараз." };
  }
  const edges = dailyEdges.map((d) => d.edgePct).filter((v) => v != null && !Number.isNaN(v));
  if (edges.length < 8 || edgePct == null) {
    return { wait: null, text: `До дати ще ${left}. Історії мало, щоб сказати, чи варто чекати.` };
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const p80 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
  const median = sorted[Math.floor(sorted.length / 2)];
  if (edgePct >= p80) {
    return {
      wait: false,
      text: `До дати ще ${left}, але сьогодні вже топ-20% днів. Чекати майже не має сенсу.`,
    };
  }
  let better = 0;
  let total = 0;
  const span = Math.max(1, daysLeft);
  for (let i = 0; i + span <= edges.length; i += 1) {
    const windowMax = Math.max(...edges.slice(i, i + span));
    total += 1;
    if (windowMax >= edgePct + improvePp) better += 1;
  }
  const pct = total ? Math.round((better / total) * 100) : null;
  if (daysLeft >= 5 && pct != null && pct >= 40) {
    return {
      wait: true,
      text: `Зачекати ще ${left} має сенс, якщо ловиш день кращий щонайменше на ${improvePp} п.п.: у ${pct}% таких вікон він був.`,
    };
  }
  if (edgePct < median && daysLeft >= 3) {
    return {
      wait: true,
      text: `До дати ще ${left}. Зараз гірше медіани — є місце почекати, але гарантії кращого дня немає.`,
    };
  }
  return {
    wait: false,
    text: `До дати ще ${left}. Різкого покращення історія не обіцяє — можна конвертувати.`,
  };
}

export function cashCompare(latest, targetEur) {
  const card = latest?.p24?.EUR?.sale;
  const cash = latest?.marketCash?.EUR?.sale;
  if (!card || !cash) return null;
  const diff = card - cash;
  const extraUah = targetEur ? diff * targetEur : null;
  const usd = latest?.business?.USD?.buy;
  const chainCard = usd ? usd / card : null;
  const chainCash = usd ? usd / cash : null;
  const cardVsCashPct =
    chainCard && chainCash ? (chainCard / chainCash - 1) * 100 : null;
  let verdict;
  if (Math.abs(diff) < 0.05) {
    verdict = "Картка EUR майже як готівка Приват — різниці майже немає.";
  } else if (diff > 0) {
    const extra =
      extraUah != null ? ` (+${Math.round(extraUah)} грн на ${targetEur} EUR)` : "";
    verdict = `Картка EUR дорожча за готівку Приват на ${diff.toFixed(2)} грн${extra}. Картка не грає, якщо можеш купити кеш.`;
  } else {
    verdict = `Картка EUR дешевша за готівку Приват на ${Math.abs(diff).toFixed(2)} грн — картка грає.`;
  }
  return {
    cashEurSale: cash,
    cardEurSale: card,
    diff: Math.round(diff * 10000) / 10000,
    extraUah: extraUah == null ? null : Math.round(extraUah),
    cardVsCashPct: cardVsCashPct == null ? null : Math.round(cardVsCashPct * 100) / 100,
    plays: diff <= 0.05,
    verdict,
    source: latest.marketCash?.source || "privat-cash",
  };
}

export function notifyKinds(snapshot, { improvePp = 0.3 } = {}) {
  const kinds = [];
  if (snapshot.spread?.favorable) kinds.push("chain");
  if (snapshot.sides?.sellUsd) kinds.push("sell-usd");
  if (snapshot.sides?.buyEur) kinds.push("buy-eur");
  const pp = snapshot.improvePp ?? improvePp;
  if (snapshot.dayDelta != null && snapshot.dayDelta >= pp) kinds.push("improved");
  return kinds;
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

export function todayAdvice(latest, rows = [], { targetEur, targetDate, improvePp } = {}) {
  const spread = latest?.spread || {};
  const sides = sideSignals(latest, rows);
  const amount = Number(targetEur || latest?.targetEur);
  const date = targetDate || latest?.targetDate || null;
  const pp = improvePp ?? latest?.improvePp ?? 0.3;
  const plan = planEurPurchase({
    eurAmount: amount,
    businessUsdBuy: latest?.business?.USD?.buy,
    p24EurSale: latest?.p24?.EUR?.sale,
    marketUsd: latest?.nbu?.USD,
    marketEur: latest?.nbu?.EUR,
  });
  const extraBit =
    costBit(plan) ||
    (spread.lossPer1000UsdUah == null
      ? ""
      : `Втрата ≈ ${Math.round(spread.lossPer1000UsdUah)} грн на 1000$.`);
  const dayDelta = dayDeltaPct(latest, rows);
  const cash = cashCompare(latest, amount);
  const daysLeft = daysUntil(date, Date.parse(latest?.ts) || Date.now());
  const horizon = waitHorizon({
    edgePct: spread.edgePct,
    daysLeft,
    dailyEdges: dailyBestEdges(rows),
    improvePp: pp,
  });
  const waitBit = horizon?.text || "";
  const cashBit = cash?.verdict || "";
  const chainOk = Boolean(spread.favorable);

  let out;
  if (sides.sellUsd && sides.buyEur) {
    out = {
      status: "do",
      title: "Вигідно і продати USD, і купити EUR",
      action: `Обидва боки в історично кращій зоні. Продай USD на ФОП і купи EUR у Приват24. ${extraBit}`.trim(),
    };
  } else if (sides.sellUsd) {
    out = {
      status: "partial",
      title: "Вигідно продати USD",
      action: `Продай долар на ФОП (курс високий). Євро поки не купуй — відносно дороге. ${extraBit}`.trim(),
    };
  } else if (sides.buyEur) {
    out = {
      status: "partial",
      title: "Вигідно купити EUR",
      action: `Купи євро в Приват24 (курс низький). USD на ФОП зараз слабкий — можна не продавати. ${extraBit}`.trim(),
    };
  } else if (chainOk) {
    out = {
      status: "do",
      title: "Спред у межах порогу",
      action: `Ланцюжок USD→EUR ок, але жоден бік не в історичному піку. Можна конвертувати через спред. ${extraBit}`.trim(),
    };
  } else if (dayDelta != null && dayDelta >= pp) {
    out = {
      status: "partial",
      title: `Стало краще на ${dayDelta.toFixed(1)} п.п. за день`,
      action: `Поріг ще не перетнуто, але спред покращився. ${extraBit}`.trim(),
    };
  } else {
    out = {
      status: "wait",
      title: "Сьогодні не вигідно",
      action: `Не конвертуй USD→EUR. ${extraBit || "Зачекай кращий спред."}`.trim(),
    };
  }

  return {
    ...out,
    sellUsd: sides.sellUsd,
    buyEur: sides.buyEur,
    usdRank: sides.usdRank,
    eurRank: sides.eurRank,
    plan,
    extraUah: plan?.extraUah ?? null,
    targetEur: plan?.eurAmount ?? amount ?? null,
    targetDate: date,
    daysLeft,
    waitText: waitBit || null,
    dayDelta,
    cash,
    improvePp: pp,
  };
}

export function buildAdviceFile(snapshot, rows = [], targetEur) {
  const advice = todayAdvice(snapshot, rows, {
    targetEur,
    targetDate: snapshot.targetDate,
    improvePp: snapshot.improvePp,
  });
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
    usdRank: advice.usdRank,
    eurRank: advice.eurRank,
    edgePct: snapshot.spread?.edgePct ?? null,
    favorable: Boolean(snapshot.spread?.favorable),
    byThreshold: Boolean(snapshot.spread?.byThreshold),
    byTopDays: Boolean(snapshot.spread?.byTopDays),
    edgeRank: snapshot.spread?.edgeRank ?? null,
    thresholdPct: snapshot.thresholdPct ?? null,
    dayDelta: advice.dayDelta,
    targetEur: plan?.eurAmount ?? targetEur ?? null,
    targetDate: advice.targetDate,
    daysLeft: advice.daysLeft,
    waitText: advice.waitText,
    extraUah: profile?.extraUah ?? round0(plan?.extraUah),
    extraUsd: profile?.extraUsd ?? round2(plan?.extraUsd),
    usdFop: profile?.usdFop ?? round2(plan?.usdFop),
    uahNeeded: profile?.uahNeeded ?? round0(plan?.uahNeeded),
    businessUsdBuy: snapshot.business?.USD?.buy ?? null,
    p24EurSale: snapshot.p24?.EUR?.sale ?? null,
    cashEurSale: advice.cash?.cashEurSale ?? snapshot.marketCash?.EUR?.sale ?? null,
    cardVsCashPct: advice.cash?.cardVsCashPct ?? null,
    cashVerdict: advice.cash?.verdict ?? null,
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
  const notes = [];
  const advice = todayAdvice(latest, rows, {
    targetEur: latest.targetEur,
    targetDate: latest.targetDate,
    improvePp: latest.improvePp,
  });

  notes.push({
    text: `${advice.title}. ${advice.action}`,
    tone:
      advice.status === "wait"
        ? "wait"
        : advice.sellUsd && advice.buyEur
          ? "both"
          : advice.sellUsd
            ? "sell"
            : advice.buyEur
              ? "buy"
              : advice.status === "do"
                ? "both"
                : "info",
  });

  if (advice.sellUsd !== advice.buyEur) {
    notes.push({
      tone: advice.sellUsd ? "sell" : "buy",
      text: advice.sellUsd
        ? `Боки розійшлись: продаж USD вигідний (перцентиль ${advice.usdRank?.toFixed?.(0) ?? "—"}), купівля EUR — ні.`
        : `Боки розійшлись: купівля EUR вигідна (перцентиль ${advice.eurRank?.toFixed?.(0) ?? "—"}), продаж USD — ні.`,
    });
  }

  if (advice.dayDelta != null) {
    const sign = advice.dayDelta >= 0 ? "+" : "";
    notes.push({
      tone: advice.dayDelta >= 0.3 ? "both" : "info",
      text: `За день спред ${sign}${advice.dayDelta.toFixed(2)} п.п.`,
    });
  }

  if (advice.waitText) {
    notes.push({
      tone: advice.status === "wait" && advice.daysLeft >= 5 ? "wait" : "info",
      text: advice.waitText,
    });
  }

  if (advice.cash?.verdict) {
    notes.push({
      tone: advice.cash.plays ? "buy" : "wait",
      text: advice.cash.verdict,
    });
  }

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

  const nowUsd = latest.business?.USD?.buy;
  const nowEur = latest.p24?.EUR?.sale;
  if (advice.usdRank != null && nowUsd != null) {
    notes.push({
      tone: advice.sellUsd ? "sell" : "wait",
      text: advice.sellUsd
        ? `USD: купівля ФОП ${nowUsd.toFixed(4)} — вище за ${advice.usdRank.toFixed(0)}% історії. Зараз вигідно продавати долар (більше гривень).`
        : `USD: купівля ФОП ${nowUsd.toFixed(4)} — лише ${advice.usdRank.toFixed(0)}-й перцентиль. Можна почекати вищий курс продажу.`,
    });
  }

  if (advice.eurRank != null && nowEur != null) {
    notes.push({
      tone: advice.buyEur ? "buy" : "wait",
      text: advice.buyEur
        ? `EUR: продаж P24 ${nowEur.toFixed(4)} — дешевше, ніж у ${(100 - advice.eurRank).toFixed(0)}% історії. Зараз вигідно купувати євро.`
        : `EUR: продаж P24 ${nowEur.toFixed(4)} — дорожче за ${advice.eurRank.toFixed(0)}% історії. Купівля зараз відносно дорога.`,
    });
  }

  return notes;
}
