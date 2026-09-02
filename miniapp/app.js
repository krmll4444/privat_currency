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

function fmt(n, digits = 4) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function fmtPct(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${Number(n).toFixed(2)}%`;
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

function cutoff(range) {
  const now = Date.now();
  if (range === "24h") return now - 24 * 3600 * 1000;
  if (range === "7d") return now - 7 * 24 * 3600 * 1000;
  if (range === "30d") return now - 30 * 24 * 3600 * 1000;
  return 0;
}

let chart;
let history = [];
let range = "7d";

function renderLatest(latest) {
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
  document.getElementById("meta").textContent = `Оновлено: ${ts} · поріг ${fmtPct(latest.thresholdPct)}`;
}

function renderChart() {
  const from = cutoff(range);
  const rows = history.filter((row) => row.ts && Date.parse(row.ts) >= from && row.spread?.edgePct != null);
  const labels = rows.map((row) => {
    const d = new Date(row.ts);
    return range === "24h"
      ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
  });
  const edges = rows.map((row) => row.spread.edgePct);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#38bdf8";
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "#94a3b8";

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Відхилення vs НБУ, %",
          data: edges,
          borderColor: color,
          backgroundColor: color + "33",
          fill: true,
          tension: 0.25,
          pointRadius: rows.length > 80 ? 0 : 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: muted } },
      },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 8 }, grid: { color: "transparent" } },
        y: { ticks: { color: muted }, grid: { color: muted + "22" } },
      },
    },
  });
}

document.getElementById("periods").addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-range]");
  if (!btn) return;
  range = btn.dataset.range;
  for (const el of event.currentTarget.querySelectorAll("button")) el.classList.toggle("on", el === btn);
  renderChart();
});

async function boot() {
  try {
    const latestText = await loadFirst(["./data/latest.json", "../data/latest.json"]);
    const latest = JSON.parse(latestText);
    renderLatest(latest);

    const historyText = await loadFirst(["./data/history.jsonl", "../data/history.jsonl"]);
    history = parseJsonl(historyText);
    renderChart();
  } catch (err) {
    document.getElementById("meta").textContent = String(err.message || err);
  }
}

boot();
