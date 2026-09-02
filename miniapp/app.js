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
  usdMarkers,
} from "./money.js";
import { bindFavorHint, createPane, destroyPanes, setPane, syncCharts } from "./charts.js";

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
let panes = [];

function resolvedTheme() {
  if (themePref === "light" || themePref === "dark") return themePref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const bg = theme === "dark" ? "#15191a" : "#f0f3f4";
  tg?.setHeaderColor?.("#4ea524");
  tg?.setBackgroundColor?.(bg);
}

function persist() {
  localStorage.setItem("privat-range", range);
  localStorage.setItem("privat-interval", String(intervalSec));
  localStorage.setItem("privat-chart-style", chartStyle);
  localStorage.setItem("privat-theme", themePref);
  localStorage.setItem("privat-target-eur", String(targetEur));
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

function renderLatest() {
  const spread = latest.spread || {};
  const rows = visibleRows();
  const amount = currentTargetEur();
  const advice = todayAdvice(latest, rows.length ? rows : history, { targetEur: amount });
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
}

function setModalOpen(open) {
  const modal = document.getElementById("calcModal");
  if (!modal) return;
  modal.hidden = !open;
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    renderCalc();
    renderAnalysis();
    document.getElementById("eurInput")?.focus();
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
  document.getElementById("openCalc")?.addEventListener("click", () => setModalOpen(true));
  document.getElementById("closeCalc")?.addEventListener("click", () => setModalOpen(false));
  document.getElementById("calcModal")?.addEventListener("click", (event) => {
    if (event.target.id === "calcModal") setModalOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const menu = document.getElementById("chartSettingsMenu");
    if (menu && !menu.hidden) {
      setSettingsOpen(false);
      return;
    }
    setModalOpen(false);
  });
  document.getElementById("chartSettingsBtn")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = document.getElementById("chartSettingsMenu");
    setSettingsOpen(Boolean(menu?.hidden));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".settings-wrap")) setSettingsOpen(false);
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
