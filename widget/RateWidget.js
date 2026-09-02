// iOS Home Screen Widget — Scriptable
// 1. У Scriptable: + → встав цей файл → назва «Курс ФОП».
// 2. Homescreen → віджет Scriptable → цей скрипт (Small або Medium).
// URL можна передати параметром віджета (latest.json).

const LATEST_URL =
  "https://raw.githubusercontent.com/krmll4444/privat_currency/main/data/latest.json";
const HISTORY_URL =
  "https://raw.githubusercontent.com/krmll4444/privat_currency/main/data/history.jsonl";

const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();

async function createWidget() {
  const data = await loadLatest();
  const history = await loadHistory();
  const advice = todayAdvice(data, history);
  const spread = data.spread || {};
  const go = advice.status !== "wait";
  const green = new Color("#4ea524");
  const wait = Color.dynamic(new Color("#586265"), new Color("#a3acae"));
  const accent = go ? green : wait;
  const bg = Color.dynamic(new Color("#f0f3f4"), new Color("#15191a"));
  const text = Color.dynamic(new Color("#1e2527"), new Color("#f4f6f6"));
  const muted = Color.dynamic(new Color("#586265"), new Color("#a3acae"));

  const w = new ListWidget();
  w.backgroundColor = bg;
  w.setPadding(12, 14, 12, 14);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const dot = header.addText("●");
  dot.textColor = accent;
  dot.font = Font.boldSystemFont(12);
  header.addSpacer(6);
  const title = header.addText("Курс ФОП");
  title.textColor = text;
  title.font = Font.boldSystemFont(13);
  header.addSpacer();
  const badge = header.addText(fmtPct(spread.edgePct));
  badge.textColor = accent;
  badge.font = Font.boldSystemFont(13);

  w.addSpacer(8);
  const verdict = w.addText(advice.title);
  verdict.textColor = accent;
  verdict.font = Font.boldSystemFont(15);
  verdict.minimumScaleFactor = 0.7;

  w.addSpacer(4);
  const action = w.addText(advice.action);
  action.textColor = text;
  action.font = Font.systemFont(12);
  action.minimumScaleFactor = 0.7;
  action.lineLimit = config.widgetFamily === "small" ? 3 : 4;

  if (config.widgetFamily !== "small") {
    w.addSpacer(8);
    addRateRow(w, "ФОП USD buy", fmt(data.business?.USD?.buy, 4), text, muted);
    addRateRow(w, "P24 EUR sale", fmt(data.p24?.EUR?.sale, 5), text, muted);
    addRateRow(w, "1 USD → EUR", fmt(spread.chainEurPerUsd, 5), text, muted);
  }

  w.addSpacer();
  const ts = data.ts ? relativeTime(data.ts) : "очікує перший fetch";
  const footer = w.addText(ts);
  footer.textColor = muted;
  footer.font = Font.systemFont(10);
  return w;
}

function addRateRow(w, label, value, text, muted) {
  const row = w.addStack();
  row.layoutHorizontally();
  const l = row.addText(label);
  l.textColor = muted;
  l.font = Font.systemFont(12);
  row.addSpacer();
  const v = row.addText(value);
  v.textColor = text;
  v.font = Font.mediumSystemFont(12);
  w.addSpacer(4);
}

async function loadLatest() {
  const url = args.widgetParameter || LATEST_URL;
  try {
    const req = new Request(url);
    req.timeoutInterval = 12;
    return await req.loadJSON();
  } catch (err) {
    return {
      ts: null,
      thresholdPct: null,
      spread: { edgePct: null, favorable: false },
      error: String(err),
    };
  }
}

async function loadHistory() {
  try {
    const req = new Request(HISTORY_URL);
    req.timeoutInterval = 12;
    const text = await req.loadString();
    return text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    return [];
  }
}

function percentileRank(value, values) {
  const nums = values.filter((v) => v != null && !isNaN(v));
  if (!nums.length || value == null) return null;
  return (nums.filter((v) => v < value).length / nums.length) * 100;
}

function todayAdvice(latest, rows) {
  const spread = latest?.spread || {};
  const usd = (rows || []).map((r) => r.business?.USD?.buy).filter((v) => v != null);
  const eur = (rows || []).map((r) => r.p24?.EUR?.sale).filter((v) => v != null);
  const usdRank = percentileRank(latest?.business?.USD?.buy, usd);
  const eurRank = percentileRank(latest?.p24?.EUR?.sale, eur);
  const sellUsd = usdRank != null ? usdRank >= 70 : false;
  const buyEur = eurRank != null ? eurRank <= 30 : false;
  const loss = spread.lossPer1000UsdUah;
  const lossBit = loss == null ? "" : `Втрата ≈ ${Math.round(loss)} грн на 1000$.`;
  if (spread.favorable || (sellUsd && buyEur)) {
    return {
      status: "do",
      title: "Сьогодні вигідно",
      action: `Продай USD на ФОП і купи EUR у Приват24. ${lossBit}`.trim(),
    };
  }
  if (sellUsd) {
    return {
      status: "partial",
      title: "Вигідно продати USD",
      action: `Продай долар на ФОП. Євро поки не купуй. ${lossBit}`.trim(),
    };
  }
  if (buyEur) {
    return {
      status: "partial",
      title: "Вигідно купити EUR",
      action: `Купи євро в Приват24. USD на ФОП зараз слабкий. ${lossBit}`.trim(),
    };
  }
  return {
    status: "wait",
    title: "Сьогодні не вигідно",
    action: `Не конвертуй USD→EUR. ${lossBit || "Зачекай кращий спред."}`.trim(),
  };
}

function fmt(n, digits) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
}

function relativeTime(iso) {
  const delta = Date.now() - Date.parse(iso);
  const min = Math.round(delta / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  return `${Math.round(min / 60)} год тому`;
}
