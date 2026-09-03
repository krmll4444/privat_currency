const HORIZONS = [1, 3, 7];

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ema(arr, span) {
  if (!arr.length) return [];
  const k = 2 / (span + 1);
  let e = arr[0];
  const out = [];
  for (const x of arr) {
    e = k * x + (1 - k) * e;
    out.push(e);
  }
  return out;
}

function linreg(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] || 0, r2: 0 };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += i;
    sy += ys[i];
    sxx += i * i;
    sxy += i * ys[i];
  }
  const den = n * sxx - sx * sx;
  const slope = den ? (n * sxy - sx * sy) / den : 0;
  const intercept = (sy - slope * sx) / n;
  let ssRes = 0;
  let ssTot = 0;
  const yMean = sy / n;
  for (let i = 0; i < n; i += 1) {
    const hat = intercept + slope * i;
    ssRes += (ys[i] - hat) ** 2;
    ssTot += (ys[i] - yMean) ** 2;
  }
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

function diffs(arr) {
  const out = [];
  for (let i = 1; i < arr.length; i += 1) out.push(arr[i] - arr[i - 1]);
  return out;
}

function autocorr(arr, lag = 1) {
  if (arr.length <= lag + 1) return 0;
  const a = arr.slice(0, -lag);
  const b = arr.slice(lag);
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  if (!loss) return 100;
  const rs = gain / period / (loss / period);
  return 100 - 100 / (1 + rs);
}

function percentileOf(value, arr) {
  if (!arr.length) return 0.5;
  return arr.filter((v) => v < value).length / arr.length;
}

function weekdayDrift(points) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (let i = 1; i < points.length; i += 1) {
    const day = new Date(points[i].time * 1000).getUTCDay();
    buckets[day].push(points[i].value - points[i - 1].value);
  }
  return buckets.map((b) => (b.length >= 3 ? mean(b) : 0));
}

function olsTrendAndCompanions(y, x1, x2) {
  if (!x1?.length || !x2?.length || y.length !== x1.length || y.length !== x2.length) {
    return null;
  }
  const n = y.length;
  if (n < 12) return null;
  let s1 = 0;
  let s2 = 0;
  let sy = 0;
  let s11 = 0;
  let s22 = 0;
  let s12 = 0;
  let s1y = 0;
  let s2y = 0;
  for (let i = 0; i < n; i += 1) {
    s1 += x1[i];
    s2 += x2[i];
    sy += y[i];
    s11 += x1[i] * x1[i];
    s22 += x2[i] * x2[i];
    s12 += x1[i] * x2[i];
    s1y += x1[i] * y[i];
    s2y += x2[i] * y[i];
  }
  const A = [
    [n, s1, s2],
    [s1, s11, s12],
    [s2, s12, s22],
  ];
  const b = [sy, s1y, s2y];
  return solve3(A, b);
}

function solve3(A, b) {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-12) return null;
    for (let c = col; c < 4; c += 1) M[col][c] /= d;
    for (let r = 0; r < 3; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = col; c < 4; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  return { a: M[0][3], b: M[1][3], c: M[2][3] };
}

function stepsForDays(days, stepSec) {
  return Math.max(1, Math.round((days * 86400) / stepSec));
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Ансамбль: тренд (лінрег), EMA-момент, mean-reversion, RSI, лагова автокореляція,
 * сезонність дня тижня, волатильність для коридору. Для edge — ще OLS на USD+EUR.
 */
export function forecastValues(points, { stepSec = 86400, companions } = {}) {
  const series = (points || []).filter((p) => p.value != null && !Number.isNaN(p.value));
  if (series.length < 8) {
    return { ok: false, reason: "мало історії", n: series.length };
  }

  const values = series.map((p) => p.value);
  const n = values.length;
  const dts = [];
  for (let i = 1; i < series.length; i += 1) {
    const dt = series[i].time - series[i - 1].time;
    if (dt > 0) dts.push(dt);
  }
  const nativeStep = dts.length ? median(dts) : stepSec;
  const last = values[n - 1];
  const d = diffs(values);
  const vol = stdev(d) || Math.abs(last) * 0.002;
  const emaF = ema(values, Math.min(5, n - 1)).at(-1);
  const emaS = ema(values, Math.min(21, n - 1)).at(-1);
  const emaMacd = ema(values, Math.min(12, n - 1)).at(-1) - ema(values, Math.min(26, n - 1)).at(-1);
  const recent = values.slice(-Math.min(60, n));
  const longRun = linreg(values);
  const shortRun = linreg(recent);
  const med = median(values);
  const z = (last - med) / (stdev(values) || vol || 1);
  const ac1 = autocorr(d);
  const rsiVal = rsi(values);
  const pct = percentileOf(last, values);
  const lastDiff = d.at(-1) || 0;
  const wd = weekdayDrift(series);
  const nextDay = new Date((series.at(-1).time + nativeStep) * 1000).getUTCDay();
  const seasonal = wd[nextDay] || 0;

  const drift = 0.45 * shortRun.slope + 0.15 * longRun.slope;
  const momentum = 0.35 * (emaF - emaS) + 0.2 * emaMacd;
  const reversion = -0.22 * z * vol;
  const rsiPull = rsiVal > 72 ? -0.12 * vol : rsiVal < 28 ? 0.12 * vol : 0;
  const persist = 0.18 * ac1 * lastDiff;

  let companionDelta = 0;
  const usd = companions?.usd;
  const eur = companions?.eur;
  if (usd && eur && usd.length === n && eur.length === n) {
    const fit = olsTrendAndCompanions(values, usd, eur);
    if (fit) {
      const usdSlope = linreg(usd.slice(-Math.min(40, n))).slope;
      const eurSlope = linreg(eur.slice(-Math.min(40, n))).slope;
      companionDelta = fit.b * usdSlope + fit.c * eurSlope;
    }
  }

  const stepDelta = drift + momentum + reversion + rsiPull + persist + 0.5 * seasonal + 0.35 * companionDelta;

  const maxSteps = stepsForDays(7, nativeStep);
  const path = [];
  let v = last;
  for (let k = 1; k <= maxSteps; k += 1) {
    const decay = Math.exp(-0.12 * (k - 1));
    const pull = 0.04 * (med - v);
    v += stepDelta * decay + pull;
    const band = 1.2816 * vol * Math.sqrt(k);
    path.push({ step: k, value: v, low: v - band, high: v + band });
  }

  const atDays = (days) => {
    const step = Math.min(path.length, stepsForDays(days, nativeStep));
    return path[step - 1];
  };

  const horizons = Object.fromEntries(HORIZONS.map((d0) => [d0, atDays(d0)]));
  const three = horizons[3];
  const delta3 = three.value - last;
  const signs = [
    Math.sign(shortRun.slope) || 0,
    Math.sign(emaF - emaS) || 0,
    Math.sign(delta3) || 0,
  ];
  const agree = signs.filter((s) => s && s === signs.find((x) => x)).length;
  const dataScore = clamp(n / 120, 0.15, 1);
  const volScore = clamp(1 / (1 + vol / (Math.abs(last) * 0.01 + 1e-6)), 0.15, 1);
  const agreeScore = agree >= 3 ? 0.85 : agree === 2 ? 0.6 : 0.35;
  const r2Score = clamp(Math.max(0, shortRun.r2), 0, 1);
  const confidence = clamp(0.3 * dataScore + 0.2 * volScore + 0.3 * agreeScore + 0.2 * r2Score, 0.12, 0.82);

  return {
    ok: true,
    n,
    stepSec: nativeStep,
    last,
    vol,
    rsi: rsiVal,
    percentile: pct * 100,
    z,
    ac1,
    shortSlope: shortRun.slope,
    longSlope: longRun.slope,
    r2: shortRun.r2,
    emaFast: emaF,
    emaSlow: emaS,
    stepDelta,
    confidence,
    horizons,
    path,
    factors: {
      drift,
      momentum,
      reversion,
      rsiPull,
      persist,
      seasonal,
      companionDelta,
    },
  };
}

export function directionLabel(kind, delta) {
  const eps = kind === "edge" ? 0.02 : 0.005;
  if (Math.abs(delta) < eps) return "боковик";
  if (kind === "usd") return delta > 0 ? "вгору · продаж USD вигідніший" : "вниз · продаж USD слабшає";
  if (kind === "eur") return delta < 0 ? "вниз · купівля EUR дешевша" : "вгору · EUR дорожчає";
  return delta > 0 ? "спред покращується" : "спред погіршується";
}

export function kindMeta(kind) {
  if (kind === "usd") {
    return { title: "Predict · USD ФОП", unit: "", digits: 4, hint: "Купівля банком, грн за 1 $" };
  }
  if (kind === "eur") {
    return { title: "Predict · EUR Приват24", unit: "", digits: 4, hint: "Продаж банком, грн за 1 €" };
  }
  return { title: "Predict · відхилення vs НБУ", unit: "%", digits: 2, hint: "edgePct ланцюжка USD→EUR" };
}

export function extractPoints(rows, pick) {
  return (rows || [])
    .map((row) => ({
      time: Math.floor(Date.parse(row.ts) / 1000),
      value: pick(row),
    }))
    .filter((p) => p.time && p.value != null && !Number.isNaN(p.value));
}

export function predictKind(kind, rows, { stepSec = 86400 } = {}) {
  const usdPts = extractPoints(rows, (r) => r.business?.USD?.buy);
  const eurPts = extractPoints(rows, (r) => r.p24?.EUR?.sale);
  const edgePts = extractPoints(rows, (r) => r.spread?.edgePct);
  const series = kind === "usd" ? usdPts : kind === "eur" ? eurPts : edgePts;
  const companions =
    kind === "edge"
      ? (() => {
          const usd = alignCompanion(series, usdPts);
          const eur = alignCompanion(series, eurPts);
          return usd && eur ? { usd, eur } : undefined;
        })()
      : undefined;
  const model = forecastValues(series, { stepSec, companions });
  if (!model.ok) return { ...model, kind, meta: kindMeta(kind) };
  const delta3 = model.horizons[3].value - model.last;
  return {
    ...model,
    kind,
    meta: kindMeta(kind),
    direction: directionLabel(kind, delta3),
  };
}

function alignCompanion(base, other) {
  const map = new Map(other.map((p) => [p.time, p.value]));
  const aligned = base.map((p) => map.get(p.time));
  if (aligned.some((v) => v == null || Number.isNaN(v))) return null;
  return aligned;
}

export function factorNotes(model) {
  if (!model?.ok) return [];
  const f = model.factors;
  const notes = [];
  notes.push(`Точок історії: ${model.n}. Короткий тренд R²=${(model.r2 * 100).toFixed(0)}%.`);
  notes.push(
    model.shortSlope > 0
      ? "Лінійний тренд останніх точок спрямований вгору."
      : "Лінійний тренд останніх точок спрямований вниз.",
  );
  notes.push(
    model.emaFast >= model.emaSlow
      ? "Швидка EMA вище повільної — імпульс позитивний."
      : "Швидка EMA нижче повільної — імпульс негативний.",
  );
  notes.push(`Mean-reversion: зараз ${model.z >= 0 ? "вище" : "нижче"} медіани на |z|=${Math.abs(model.z).toFixed(2)}.`);
  notes.push(`RSI ${model.rsi.toFixed(0)}${model.rsi > 70 ? " (розтягнуто вгору)" : model.rsi < 30 ? " (розтягнуто вниз)" : ""}.`);
  notes.push(`Автокореляція змін (lag-1) ${model.ac1.toFixed(2)} — ${Math.abs(model.ac1) > 0.25 ? "є інерція" : "майже випадкове блукання"}.`);
  notes.push(`Перцентиль поточного значення: ${model.percentile.toFixed(0)}% історії.`);
  if (Math.abs(f.companionDelta) > 1e-6) {
    notes.push("Для відхилення враховано регресію на курси USD і EUR.");
  }
  notes.push("Сезонність дня тижня додається, якщо вистачає спостережень.");
  return notes;
}
