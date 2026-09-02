// iOS Home Screen Widget — Scriptable
// 1. У Scriptable: + → встав цей файл → назва «Курс ФОП».
// 2. Homescreen → віджет Scriptable → цей скрипт (Small або Medium).
// Параметр віджета може замінити URL (advice.json). Не тягне history.jsonl.

const ADVICE_URL =
  "https://raw.githubusercontent.com/krmll4444/privat_currency/main/data/advice.json";

const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}
Script.complete();

async function createWidget() {
  const data = await loadAdvice();
  const go = data.status && data.status !== "wait";
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
  const badge = header.addText(fmtPct(data.edgePct));
  badge.textColor = accent;
  badge.font = Font.boldSystemFont(13);

  w.addSpacer(8);
  const verdict = w.addText(data.title || "Немає поради");
  verdict.textColor = accent;
  verdict.font = Font.boldSystemFont(15);
  verdict.minimumScaleFactor = 0.7;

  if (data.extraUah != null && data.targetEur) {
    w.addSpacer(4);
    const cost = w.addText(`Доплата ${Math.round(data.extraUah)} грн / ${data.targetEur} EUR`);
    cost.textColor = text;
    cost.font = Font.mediumSystemFont(13);
    cost.minimumScaleFactor = 0.7;
  }

  w.addSpacer(4);
  const action = w.addText(data.action || "");
  action.textColor = text;
  action.font = Font.systemFont(12);
  action.minimumScaleFactor = 0.7;
  action.lineLimit = config.widgetFamily === "small" ? 3 : 4;

  if (data.waitText && config.widgetFamily !== "small") {
    w.addSpacer(4);
    const wait = w.addText(data.waitText);
    wait.textColor = muted;
    wait.font = Font.systemFont(11);
    wait.minimumScaleFactor = 0.7;
    wait.lineLimit = 3;
  }

  if (config.widgetFamily !== "small") {
    w.addSpacer(8);
    addRateRow(w, "ФОП USD buy", fmt(data.businessUsdBuy, 4), text, muted);
    addRateRow(w, "P24 EUR sale", fmt(data.p24EurSale, 5), text, muted);
    if (data.cashEurSale) {
      addRateRow(w, "Готівка EUR sale", fmt(data.cashEurSale, 5), text, muted);
    }
    addRateRow(w, "1 USD → EUR", fmt(data.chainEurPerUsd, 5), text, muted);
    if (data.dayDelta != null) {
      const sign = data.dayDelta >= 0 ? "+" : "";
      addRateRow(w, "За день", `${sign}${Number(data.dayDelta).toFixed(2)} п.п.`, text, muted);
    }
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

async function loadAdvice() {
  const url = args.widgetParameter || ADVICE_URL;
  try {
    const req = new Request(url);
    req.timeoutInterval = 12;
    return await req.loadJSON();
  } catch (err) {
    return {
      ts: null,
      status: "wait",
      title: "Немає даних",
      action: String(err),
      edgePct: null,
      extraUah: null,
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
  return `${Math.round(min / 60)} год тому`;
}
