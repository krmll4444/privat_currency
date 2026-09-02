import { deltaHistogram } from "./money.js";

const UP = "#22c55e";
const DOWN = "#ef4444";

function css(name, fallback) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function chartOptions() {
  const text = css("--text", "#f8fafc");
  const muted = css("--muted", "#94a3b8");
  const bg = css("--card", "#1e293b");
  const line = css("--line", "#334155");

  return {
    autoSize: true,
    layout: {
      background: { color: bg },
      textColor: text,
      fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
    },
    grid: {
      vertLines: { color: line },
      horzLines: { color: line },
    },
    rightPriceScale: { borderColor: line },
    timeScale: {
      borderColor: line,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      horzLine: { color: muted, labelBackgroundColor: bg },
      vertLine: { color: muted, labelBackgroundColor: bg },
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  };
}

export function createPane(el, { invertColors = false, precision = 4 } = {}) {
  if (!el || !window.LightweightCharts) return null;
  el.replaceChildren();
  const LWC = window.LightweightCharts;
  const chart = LWC.createChart(el, chartOptions());
  const up = invertColors ? DOWN : UP;
  const down = invertColors ? UP : DOWN;

  const candles = chart.addCandlestickSeries({
    upColor: up,
    downColor: down,
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
    priceFormat: { type: "price", precision, minMove: 10 ** -precision },
  });
  candles.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.28 },
  });

  const delta = chart.addHistogramSeries({
    priceScaleId: "delta",
    priceFormat: { type: "price", precision, minMove: 10 ** -precision },
  });
  chart.priceScale("delta").applyOptions({
    scaleMargins: { top: 0.82, bottom: 0 },
    borderVisible: false,
  });

  return { chart, candles, delta };
}

export function setPane(pane, candles, markers) {
  if (!pane) return;
  pane.candles.setData(candles);
  pane.delta.setData(deltaHistogram(candles));
  pane.candles.setMarkers(markers);
  pane.chart.timeScale().fitContent();
}

export function syncCharts(panes) {
  const live = panes.filter(Boolean);
  let lock = false;
  for (const pane of live) {
    pane.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (lock || !range) return;
      lock = true;
      for (const other of live) {
        if (other === pane) continue;
        other.chart.timeScale().setVisibleLogicalRange(range);
      }
      lock = false;
    });
  }
}

export function destroyPanes(panes) {
  for (const pane of panes) pane?.chart.remove();
}
