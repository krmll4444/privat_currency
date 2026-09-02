// iOS Home Screen Widget — Scriptable
// 1. Заміни LATEST_URL на свій GitHub Pages (або raw.githubusercontent.com).
// 2. У Scriptable: + → встав цей файл → назва «Курс ФОП».
// 3. Homescreen → віджет Scriptable → цей скрипт (Small або Medium).
//
// URL також можна передати параметром віджета.

const LATEST_URL =
  "https://raw.githubusercontent.com/krmll4444/privat_currency/main/data/latest.json";

const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();

async function createWidget() {
  const data = await loadLatest();
  const spread = data.spread || {};
  const favorable = Boolean(spread.favorable);
  const accent = favorable ? new Color("#22c55e") : new Color("#94a3b8");
  const bg = Color.dynamic(new Color("#f8fafc"), new Color("#0f172a"));
  const text = Color.dynamic(new Color("#0f172a"), new Color("#f8fafc"));
  const muted = Color.dynamic(new Color("#64748b"), new Color("#94a3b8"));

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

  w.addSpacer(10);

  const chain = w.addText(`1 USD  →  ${fmt(spread.chainEurPerUsd, 5)} EUR`);
  chain.textColor = text;
  chain.font = Font.semiboldSystemFont(16);

  w.addSpacer(4);
  const vs = w.addText(`НБУ  ${fmt(spread.marketEurPerUsd, 5)}  ·  поріг ${fmtPct(data.thresholdPct)}`);
  vs.textColor = muted;
  vs.font = Font.systemFont(11);

  if (config.widgetFamily !== "small") {
    w.addSpacer(10);
    addRateRow(w, "ФОП USD buy", fmt(data.business?.USD?.buy, 4), text, muted);
    addRateRow(w, "P24 EUR sale", fmt(data.p24?.EUR?.sale, 5), text, muted);
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
  const hours = Math.round(min / 60);
  return `${hours} год тому`;
}
