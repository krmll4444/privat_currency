import { deltaHistogram, toLine } from "./money.js";

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

function addFavorSeries(chart) {
  const favor = chart.addHistogramSeries({
    priceScaleId: "favor",
    lastValueVisible: false,
    priceLineVisible: false,
    base: 0,
  });
  chart.priceScale("favor").applyOptions({
    visible: false,
    scaleMargins: { top: 0, bottom: 0 },
  });
  return favor;
}

export function createPane(
  el,
  { invertColors = false, precision = 4, style = "candles", baseline = false } = {},
) {
  if (!el || !window.LightweightCharts) return null;
  el.replaceChildren();
  const LWC = window.LightweightCharts;
  const chart = LWC.createChart(el, chartOptions());
  const favor = addFavorSeries(chart);
  const up = invertColors ? DOWN : UP;
  const down = invertColors ? UP : DOWN;
  const isLine = style === "line";
  const lineType = LWC.LineType?.Simple ?? 0;

  let main;
  if (isLine && baseline) {
    main = chart.addBaselineSeries({
      baseValue: { type: "price", price: 0 },
      topLineColor: UP,
      topFillColor1: "rgba(34, 197, 94, 0.28)",
      topFillColor2: "rgba(34, 197, 94, 0.04)",
      bottomLineColor: DOWN,
      bottomFillColor1: "rgba(239, 68, 68, 0.22)",
      bottomFillColor2: "rgba(239, 68, 68, 0.04)",
      lineWidth: 2,
      lineType,
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
  } else if (isLine) {
    main = chart.addLineSeries({
      color: invertColors ? "#38bdf8" : UP,
      lineWidth: 2,
      lineType,
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
  } else {
    main = chart.addCandlestickSeries({
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
  }

  main.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: isLine ? 0.08 : 0.28 },
  });

  let delta = null;
  if (!isLine) {
    delta = chart.addHistogramSeries({
      priceScaleId: "delta",
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
    chart.priceScale("delta").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
    });
  }

  return { chart, main, delta, favor, style, isLine };
}

export function setPane(pane, candles, markers, favorData) {
  if (!pane) return;
  pane.main.setData(pane.isLine ? toLine(candles) : candles);
  pane.delta?.setData(deltaHistogram(candles));
  pane.favor?.setData(favorData || []);
  pane.main.setMarkers(markers);
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
