import {
  analyze,
  cutoffMs,
  eurMarkers,
  edgeMarkers,
  fmt,
  fmtPct,
  planEurPurchase,
  toCandles,
  usdMarkers,
} from "./money.js";
import { createPane, destroyPanes, setPane, syncCharts } from "./charts.js";

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  applyTheme(tg.themeParams);
  tg.onEvent("themeChanged", () => applyTheme(tg.themeParams));
}

function applyTheme(tp = {}) {
  const root = document.documentElement.style;
  if (tp.bg_color) root.setProperty("--bg", tp.bg_color);
  if (tp.secondary_bg_color) root.setProperty("--card", tp.secondary_bg_color);
  if (tp.text_color) root.setProperty("--text", tp.text_color);
  if (tp.hint_color) root.setProperty("--muted", tp.hint_color);
  if (tp.hint_color) root.setProperty("--line", tp.hint_color + "44");
  if (tp.button_color) root.setProperty("--accent", tp.button_color);
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

let latest = null;
let history = [];
let range = "7d";
let intervalSec = 3600;
let panes = [];

function renderLatest() {
  const spread = latest.spread || {};
  const badge = document.getElementById("badge");
  badge.textContent = spread.favorable ? `Вигідно ${fmtPct(spread.edgePct)}` : fmtPct(spread.edgePct);
  badge.className = `badge ${spread.favorable ? "green" : "gray"}`;
  document.getElementById("chain").textContent = `${fmt(spread.chainEurPerUsd, 5)} €`;
  document.getElementById("nbu").textContent = `${fmt(spread.marketEurPerUsd, 5)} €`;
  document.getElementById("loss").textContent =
    spread.lossPer1000UsdUah == null ? "—" : `${Math.round(spread.lossPer1000UsdUah)} грн`;
  document.getElementById("bizUsd").textContent = fmt(latest.business?.USD?.buy, 4);
  document.getElementById("p24Eur").textContent = fmt(latest.p24?.EUR?.sale, 5);
  const ts = latest.ts ? new Date(latest.ts).toLocaleString("uk-UA") : "ще не було запуску";
  document.getElementById("meta").textContent = `Оновлено: ${ts} · поріг ${fmtPct(latest.thresholdPct)} · зум на графіках`;
}

function renderCalc() {
  const eurAmount = Number(document.getElementById("eurInput").value);
  const plan = planEurPurchase({
    eurAmount,
    businessUsdBuy: latest?.business?.USD?.buy,
    p24EurSale: latest?.p24?.EUR?.sale,
    marketUsd: latest?.nbu?.USD,
    marketEur: latest?.nbu?.EUR,
  });
  if (!plan) {
    document.getElementById("calcUsd").textContent = "—";
    document.getElementById("calcUah").textContent = "—";
    document.getElementById("calcUsdNbu").textContent = "—";
    document.getElementById("calcLoss").textContent = "—";
    return;
  }
  document.getElementById("calcUsd").textContent = `${fmt(plan.usdFop, 2)} $`;
  document.getElementById("calcUah").textContent = `${fmt(plan.uahNeeded, 0)} грн`;
  document.getElementById("calcUsdNbu").textContent = `${fmt(plan.usdNbu, 2)} $`;
  document.getElementById("calcLoss").textContent =
    `${fmt(plan.extraUsd, 2)} $  ·  ${fmt(plan.extraUah, 0)} грн  ·  ${fmtPct(plan.lossPct)}`;
}

function renderAnalysis() {
  const from = cutoffMs(range);
  const rows = history.filter((row) => row.ts && Date.parse(row.ts) >= from);
  const notes = analyze(rows.length ? rows : history, latest);
  const list = document.getElementById("analysisList");
  list.replaceChildren(
    ...notes.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
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
  const from = cutoffMs(range);
  const rows = history.filter((row) => row.ts && Date.parse(row.ts) >= from);
  const usd = toCandles(points(rows, (r) => r.business?.USD?.buy), intervalSec);
  const eur = toCandles(points(rows, (r) => r.p24?.EUR?.sale), intervalSec);
  const edge = toCandles(points(rows, (r) => r.spread?.edgePct), intervalSec);

  if (panes.length) destroyPanes(panes);
  panes = [
    createPane(document.getElementById("chartUsd"), { precision: 4 }),
    createPane(document.getElementById("chartEur"), { invertColors: true, precision: 4 }),
    createPane(document.getElementById("chartEdge"), { precision: 2 }),
  ];
  setPane(panes[0], usd, usdMarkers(usd));
  setPane(panes[1], eur, eurMarkers(eur));
  setPane(panes[2], edge, edgeMarkers(edge));
  syncCharts(panes);
}

function bindToggles(rootId, attr, apply) {
  document.getElementById(rootId).addEventListener("click", (event) => {
    const btn = event.target.closest(`button[${attr}]`);
    if (!btn) return;
    for (const el of event.currentTarget.querySelectorAll("button")) {
      el.classList.toggle("on", el === btn);
    }
    apply(btn);
    renderAnalysis();
    renderCharts();
  });
}

document.getElementById("eurInput").addEventListener("input", renderCalc);

bindToggles("ranges", "data-range", (btn) => {
  range = btn.dataset.range;
});
bindToggles("intervals", "data-interval", (btn) => {
  intervalSec = Number(btn.dataset.interval);
});

async function boot() {
  try {
    latest = JSON.parse(await loadFirst(["./data/latest.json", "../data/latest.json"]));
    renderLatest();
    renderCalc();
    const historyText = await loadFirst(["./data/history.jsonl", "../data/history.jsonl"]);
    history = parseJsonl(historyText);
    renderAnalysis();
    renderCharts();
  } catch (err) {
    document.getElementById("meta").textContent = String(err.message || err);
  }
}

boot();
window.addEventListener("resize", () => {
  for (const pane of panes) pane.chart.applyOptions({ autoSize: true });
});
