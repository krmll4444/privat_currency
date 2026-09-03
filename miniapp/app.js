import {
  analyze,
  cutoffMs,
  eurMarkers,
  edgeMarkers,
  favorHistogram,
  favorHints,
  fmt,
  fmtPct,
  planEurPurchase,
  snapByInterval,
  toCandles,
  todayAdvice,
  insightItems,
  usdMarkers,
} from "./money.js?v=20260903c";
import { bindFavorHint, createPane, destroyPanes, setPane, syncCharts } from "./charts.js?v=20260903c";
import { factorNotes, predictKind } from "./predict.js?v=20260903c";

const RANGE_LABEL = {
  "24h": "24 год",
  "7d": "7 днів",
  "30d": "30 днів",
  "90d": "3 міс",
  all: "Усе",
};
const INTERVAL_LABEL = {
  900: "15 хв",
  3600: "1 год",
  14400: "4 год",
  86400: "1 день",
};

const DEFAULT_TARGET_EUR = 2000;
const stored = (key, fallback) => localStorage.getItem(key) || fallback;

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

let latest = null;
let history = [];
let range = stored("privat-range", "90d");
let intervalSec = Number(stored("privat-interval", "86400")) || 86400;
let chartStyle = stored("privat-chart-style", "candles") === "line" ? "line" : "candles";
let themePref = ["light", "dark", "auto"].includes(stored("privat-theme", "auto"))
  ? stored("privat-theme", "auto")
  : "auto";
let targetEur =
  Number(stored("privat-target-eur", String(DEFAULT_TARGET_EUR))) || DEFAULT_TARGET_EUR;
let targetDate = stored("privat-target-date", "") || "";
let panes = [];

function resolvedTheme() {
  if (themePref === "light" || themePref === "dark") return themePref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
}

function persist() {
  localStorage.setItem("privat-range", range);
  localStorage.setItem("privat-interval", String(intervalSec));
  localStorage.setItem("privat-chart-style", chartStyle);
  localStorage.setItem("privat-theme", themePref);
  localStorage.setItem("privat-target-eur", String(targetEur));
  if (targetDate) localStorage.setItem("privat-target-date", targetDate);
  else localStorage.removeItem("privat-target-date");
}

function adviceOpts() {
  return {
    targetEur: currentTargetEur(),
    targetDate: targetDate || latest?.targetDate || null,
  };
}

function currentTargetEur() {
  const n = Number(document.getElementById("eurInput")?.value);
  return n > 0 ? n : targetEur;
}

function markPills(rootId, attr, value) {
  const root = document.getElementById(rootId);
  if (!root) return;
  for (const btn of root.querySelectorAll("button")) {
    btn.classList.toggle("on", String(btn.getAttribute(attr)) === String(value));
  }
}

function syncSettings() {
  markPills("themePills", "data-theme", themePref);
  markPills("rangePills", "data-range", range);
  markPills("intervalPills", "data-interval", intervalSec);
  markPills("stylePills", "data-style", chartStyle);
  const summary = document.getElementById("chartSummary");
  if (summary) {
    summary.textContent = `${RANGE_LABEL[range] || range} · ${INTERVAL_LABEL[intervalSec] || "1 день"}`;
  }
}

async function loadFirst(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${url} ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Немає даних");
}

function parseJsonl(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function visibleRows() {
  const from = cutoffMs(range);
  return history.filter((row) => row.ts && Date.parse(row.ts) >= from);
}

const INSIGHT_ICONS = {
  now_go: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  now_buy: "M12 4 10.59 5.41 16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  now_wait: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20Zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9Z",
  now_meh: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  day_go: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  day_bad: "M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z",
  day_meh: "M22 12l-4-4v3H3v2h15v3z",
  cash_buy: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2Zm0 14H4v-6h16v6Zm0-10H4V6h16v2Z",
  cash_bad: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2Zm0 14H4v-6h16v6Zm0-10H4V6h16v2Z",
  cash_meh: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2Zm0 14H4v-6h16v6Zm0-10H4V6h16v2Z",
  date_go: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 16H5V10h14v10Zm0-12H5V6h14v2Zm-7 5h5v5h-5v-5Z",
  date_wait: "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6Z",
  date_bad: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 16H5V10h14v10ZM9.5 11.5 11 13l-1.5 1.5L11 16l-1.5 1.5L8 16l-1.5 1.5L5 16l1.5-1.5L5 13l1.5-1.5L8 13l1.5-1.5Zm9 0L17 13l1.5 1.5L17 16l1.5 1.5L20 16l-1.5-1.5L20 13l-1.5-1.5Z",
  date_meh: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 16H5V10h14v10Zm0-12H5V6h14v2Z",
};

function insightIcon(id, tone) {
  const d = INSIGHT_ICONS[`${id}_${tone}`] || INSIGHT_ICONS.now_meh;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
}

function renderInsights(advice) {
  const root = document.getElementById("insights");
  if (!root) return;
  const items = insightItems(advice);
  root.hidden = !items.length;
  root.replaceChildren(
    ...items.map((item) => {
      const el = document.createElement("article");
      el.className = `insight insight--${item.tone}`;
      const icon = document.createElement("span");
      icon.className = "insight-icon";
      icon.appendChild(insightIcon(item.id, item.tone));
      const copy = document.createElement("div");
      copy.className = "insight-copy";
      const kicker = document.createElement("p");
      kicker.className = "insight-kicker";
      kicker.textContent = item.kicker;
      const title = document.createElement("p");
      title.className = "insight-title";
      title.textContent = item.title;
      const hint = document.createElement("p");
      hint.className = "insight-hint";
      hint.textContent = item.hint;
      copy.append(kicker, title, hint);
      el.append(icon, copy);
      return el;
    }),
  );
}

function renderLatest() {
  const spread = latest.spread || {};
  const rows = visibleRows();
  const amount = currentTargetEur();
  const advice = todayAdvice(latest, rows.length ? rows : history, adviceOpts());
  const badge = document.getElementById("badge");
  const extra =
    advice.extraUah == null ? "" : ` · ${Math.round(advice.extraUah)} грн`;
  badge.textContent = `${advice.title}${extra}`;
  badge.className = `badge ${advice.status === "wait" ? "gray" : "green"}`;
  document.getElementById("chain").textContent = `${fmt(spread.chainEurPerUsd, 5)} €`;
  document.getElementById("nbu").textContent = `${fmt(spread.marketEurPerUsd, 5)} €`;
  const lossLabel = document.getElementById("lossLabel");
  if (lossLabel) lossLabel.textContent = `Доплата / ${amount} EUR`;
  document.getElementById("loss").textContent =
    advice.extraUah == null ? "—" : `${Math.round(advice.extraUah)} грн`;
  document.getElementById("bizUsd").textContent = fmt(latest.business?.USD?.buy, 4);
  document.getElementById("p24Eur").textContent = fmt(latest.p24?.EUR?.sale, 5);
  document.getElementById("rateUsd")?.classList.toggle("hot", advice.sellUsd);
  document.getElementById("rateEur")?.classList.toggle("hot", advice.buyEur);
  renderInsights(advice);
  const ts = latest.ts ? new Date(latest.ts).toLocaleString("uk-UA") : "ще не було запуску";
  document.getElementById("meta").textContent =
    `${advice.action} · оновлено ${ts} · поріг ${fmtPct(latest.thresholdPct)}`;
}

function renderCalc() {
  const input = document.getElementById("eurInput");
  const eurAmount = Number(input?.value);
  const plan = planEurPurchase({
    eurAmount,
    businessUsdBuy: latest?.business?.USD?.buy,
    p24EurSale: latest?.p24?.EUR?.sale,
    marketUsd: latest?.nbu?.USD,
    marketEur: latest?.nbu?.EUR,
  });
  const usd = document.getElementById("calcUsd");
  const uah = document.getElementById("calcUah");
  const nbuUsd = document.getElementById("calcUsdNbu");
  const loss = document.getElementById("calcLoss");
  if (!usd || !uah || !nbuUsd || !loss) return;
  if (!plan) {
    usd.textContent = "—";
    uah.textContent = "—";
    nbuUsd.textContent = "—";
    loss.textContent = "—";
    return;
  }
  usd.textContent = `${fmt(plan.usdFop, 2)} $`;
  uah.textContent = `${fmt(plan.uahNeeded, 0)} грн`;
  nbuUsd.textContent = `${fmt(plan.usdNbu, 2)} $`;
  loss.textContent = `${fmt(plan.extraUsd, 2)} $  ·  ${fmt(plan.extraUah, 0)} грн  ·  ${fmtPct(plan.lossPct)}`;
}

function renderAnalysis() {
  const list = document.getElementById("analysisList");
  if (!list || !latest) return;
  const rows = visibleRows();
  const notes = analyze(rows.length ? rows : history, {
    ...latest,
    targetEur: currentTargetEur(),
    targetDate: targetDate || latest.targetDate || null,
  });
  list.replaceChildren(
    ...notes.map((note) => {
      const li = document.createElement("li");
      const item = typeof note === "string" ? { text: note, tone: "info" } : note;
      li.textContent = item.text;
      li.className = `tone-${item.tone || "info"}`;
      return li;
    }),
  );
}

function points(rows, pick) {
  return rows
    .map((row) => ({
      time: Math.floor(Date.parse(row.ts) / 1000),
      value: pick(row),
    }))
    .filter((p) => p.time && p.value != null && !Number.isNaN(p.value));
}

function renderCharts() {
  const rows = visibleRows();
  const usd = toCandles(points(rows, (r) => r.business?.USD?.buy), intervalSec);
  const eur = toCandles(points(rows, (r) => r.p24?.EUR?.sale), intervalSec);
  const edge = toCandles(points(rows, (r) => r.spread?.edgePct), intervalSec);
  const threshold = latest?.thresholdPct ?? -1;
  const favor = favorHistogram(edge, threshold);
  const hints = favorHints(edge, snapByInterval(rows, intervalSec), threshold);
  const tip = document.getElementById("chartTip");
  if (tip) tip.hidden = true;

  if (panes.length) destroyPanes(panes);
  const style = chartStyle;
  panes = [
    createPane(document.getElementById("chartUsd"), { precision: 4, style }),
    createPane(document.getElementById("chartEur"), {
      invertColors: true,
      precision: 4,
      style,
    }),
    createPane(document.getElementById("chartEdge"), {
      precision: 2,
      style,
      baseline: true,
    }),
  ];
  setPane(panes[0], usd, usdMarkers(usd), favor);
  setPane(panes[1], eur, eurMarkers(eur), favor);
  setPane(panes[2], edge, edgeMarkers(edge), favor);
  bindFavorHint(panes[0], hints, tip);
  bindFavorHint(panes[1], hints, tip);
  bindFavorHint(panes[2], hints, tip);
  syncCharts(panes);
}

function refresh() {
  persist();
  syncSettings();
  if (latest) {
    renderLatest();
    renderAnalysis();
    renderCharts();
  }
}

function setSettingsOpen(open) {
  const menu = document.getElementById("chartSettingsMenu");
  const btn = document.getElementById("chartSettingsBtn");
  if (!menu || !btn) return;
  menu.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) setInfoOpen(false);
}

let infoPinned = false;

function setInfoOpen(open, { pin } = {}) {
  const pop = document.getElementById("chartInfoPop");
  const btn = document.getElementById("chartInfoBtn");
  if (!pop || !btn) return;
  pop.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) infoPinned = false;
  else if (pin) infoPinned = true;
  if (open) {
    const menu = document.getElementById("chartSettingsMenu");
    const gear = document.getElementById("chartSettingsBtn");
    if (menu) menu.hidden = true;
    gear?.setAttribute("aria-expanded", "false");
  }
}

function setModalOpen(open) {
  const modal = document.getElementById("calcModal");
  if (!modal) return;
  modal.hidden = !open;
  if (open) {
    renderCalc();
    renderAnalysis();
    document.getElementById("eurInput")?.focus();
  }
  syncBodyScroll();
}

function setPredictOpen(open) {
  const modal = document.getElementById("predictModal");
  if (!modal) return;
  modal.hidden = !open;
  syncBodyScroll();
}

function syncBodyScroll() {
  const calc = document.getElementById("calcModal");
  const pred = document.getElementById("predictModal");
  document.body.style.overflow =
    (calc && !calc.hidden) || (pred && !pred.hidden) ? "hidden" : "";
}

function formatPredictValue(kind, n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (kind === "edge") return fmtPct(n);
  return fmt(n, 4);
}

function renderPredict(kind) {
  const rows = history.length ? history : visibleRows();
  const model = predictKind(kind, rows, { stepSec: intervalSec });
  const title = document.getElementById("predict-title");
  const hint = document.getElementById("predictHint");
  const dir = document.getElementById("predictDir");
  const now = document.getElementById("predictNow");
  const p1 = document.getElementById("predict1");
  const p3 = document.getElementById("predict3");
  const p7 = document.getElementById("predict7");
  const conf = document.getElementById("predictConf");
  const band = document.getElementById("predictBand");
  const list = document.getElementById("predictFactors");
  if (title) title.textContent = model.meta.title;
  if (hint) hint.textContent = model.meta.hint;
  if (!model.ok) {
    if (dir) dir.textContent = "Недостатньо історії для предикту.";
    if (now) now.textContent = "—";
    if (p1) p1.textContent = "—";
    if (p3) p3.textContent = "—";
    if (p7) p7.textContent = "—";
    if (conf) conf.textContent = "—";
    if (band) band.textContent = "Потрібно щонайменше 8 точок.";
    if (list) list.replaceChildren();
    return;
  }
  const h3 = model.horizons[3];
  if (dir) dir.textContent = model.direction;
  if (now) now.textContent = formatPredictValue(kind, model.last);
  if (p1) p1.textContent = formatPredictValue(kind, model.horizons[1].value);
  if (p3) p3.textContent = formatPredictValue(kind, model.horizons[3].value);
  if (p7) p7.textContent = formatPredictValue(kind, model.horizons[7].value);
  if (conf) conf.textContent = `${Math.round(model.confidence * 100)}%`;
  if (band) {
    band.textContent = `Коридор 3 дні (≈80%): ${formatPredictValue(kind, h3.low)} … ${formatPredictValue(kind, h3.high)} · ${model.n} точок усієї історії.`;
  }
  if (list) {
    list.replaceChildren(
      ...factorNotes(model).map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
  }
}

function bindPills(rootId, onPick) {
  document.getElementById(rootId)?.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    onPick(btn);
    refresh();
  });
}

function bindUi() {
  applyTheme();
  syncSettings();
  const eurInput = document.getElementById("eurInput");
  if (eurInput) {
    eurInput.value = String(targetEur);
    eurInput.addEventListener("input", () => {
      const n = Number(eurInput.value);
      if (n > 0) {
        targetEur = n;
        persist();
      }
      renderCalc();
      if (latest) {
        renderLatest();
        renderAnalysis();
      }
    });
  }
  const dateInput = document.getElementById("dateInput");
  if (dateInput) {
    dateInput.value = targetDate;
    dateInput.addEventListener("input", () => {
      targetDate = dateInput.value || "";
      persist();
      if (latest) {
        renderLatest();
        renderAnalysis();
      }
    });
  }
  document.getElementById("openCalc")?.addEventListener("click", () => setModalOpen(true));
  document.getElementById("closeCalc")?.addEventListener("click", () => setModalOpen(false));
  document.getElementById("calcModal")?.addEventListener("click", (event) => {
    if (event.target.id === "calcModal") setModalOpen(false);
  });
  document.getElementById("closePredict")?.addEventListener("click", () => setPredictOpen(false));
  document.getElementById("predictModal")?.addEventListener("click", (event) => {
    if (event.target.id === "predictModal") setPredictOpen(false);
  });
  document.querySelector(".charts")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-predict]");
    if (!btn) return;
    renderPredict(btn.dataset.predict);
    setPredictOpen(true);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const info = document.getElementById("chartInfoPop");
    if (info && !info.hidden) {
      setInfoOpen(false);
      return;
    }
    const menu = document.getElementById("chartSettingsMenu");
    if (menu && !menu.hidden) {
      setSettingsOpen(false);
      return;
    }
    const pred = document.getElementById("predictModal");
    if (pred && !pred.hidden) {
      setPredictOpen(false);
      return;
    }
    setModalOpen(false);
  });
  document.getElementById("chartSettingsBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = document.getElementById("chartSettingsMenu");
    setSettingsOpen(Boolean(menu?.hidden));
  });
  const infoWrap = document.getElementById("chartInfoWrap");
  const infoBtn = document.getElementById("chartInfoBtn");
  infoWrap?.addEventListener("pointerenter", () => {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) setInfoOpen(true);
  });
  infoWrap?.addEventListener("pointerleave", () => {
    if (!infoPinned) setInfoOpen(false);
  });
  infoBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    const pop = document.getElementById("chartInfoPop");
    if (!pop) return;
    if (!pop.hidden && infoPinned) {
      setInfoOpen(false);
      return;
    }
    setInfoOpen(true, { pin: true });
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".settings-wrap")) setSettingsOpen(false);
    if (!event.target.closest?.(".info-wrap")) setInfoOpen(false);
  });
  bindPills("themePills", (btn) => {
    themePref = btn.dataset.theme;
    applyTheme();
  });
  bindPills("rangePills", (btn) => {
    range = btn.dataset.range;
  });
  bindPills("intervalPills", (btn) => {
    intervalSec = Number(btn.dataset.interval);
  });
  bindPills("stylePills", (btn) => {
    chartStyle = btn.dataset.style === "line" ? "line" : "candles";
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themePref === "auto") applyTheme();
  });
}

bindUi();

async function boot() {
  try {
    latest = JSON.parse(await loadFirst(["./data/latest.json", "../data/latest.json"]));
    if (!targetDate && latest.targetDate) {
      targetDate = latest.targetDate;
      const dateInput = document.getElementById("dateInput");
      if (dateInput) dateInput.value = targetDate;
    }
    renderLatest();
    renderCalc();
    const historyText = await loadFirst(["./data/history.jsonl", "../data/history.jsonl"]);
    history = parseJsonl(historyText);
    renderLatest();
    renderAnalysis();
    renderCharts();
  } catch (err) {
    document.getElementById("meta").textContent = String(err.message || err);
  }
}

boot();
window.addEventListener("resize", () => {
  for (const pane of panes) pane?.chart.applyOptions({ autoSize: true });
});
