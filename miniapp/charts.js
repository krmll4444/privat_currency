import { deltaHistogram, toLine } from "./money.js";

function css(name, fallback) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}

function palette() {
  return {
    up: css("--green", "#4ea524"),
    down: css("--red", "#f53d46"),
    text: css("--text", "rgba(0,0,0,.96)"),
    muted: css("--muted", "rgba(0,0,0,.54)"),
    bg: css("--card", "#fff"),
    line: css("--line", "rgba(0,0,0,.15)"),
    blue: css("--blue", "#008ffe"),
    font: css("font-family", "Manrope, Helvetica, Arial, sans-serif"),
  };
}

function chartOptions() {
  const p = palette();
  return {
    autoSize: true,
    layout: {
      background: { color: p.bg },
      textColor: p.text,
      fontFamily: p.font,
    },
    grid: {
      vertLines: { color: p.line },
      horzLines: { color: p.line },
    },
    rightPriceScale: { borderColor: p.line },
    timeScale: {
      borderColor: p.line,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      horzLine: { color: p.muted, labelBackgroundColor: p.bg },
      vertLine: { color: p.muted, labelBackgroundColor: p.bg },
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
  const p = palette();
  const chart = LWC.createChart(el, chartOptions());
  const favor = addFavorSeries(chart);
  const up = invertColors ? p.down : p.up;
  const down = invertColors ? p.up : p.down;
  const isLine = style === "line";
  const lineType = LWC.LineType?.Simple ?? 0;

  let main;
  if (isLine && baseline) {
    main = chart.addBaselineSeries({
      baseValue: { type: "price", price: 0 },
      topLineColor: p.up,
      topFillColor1: "rgba(78, 165, 36, 0.28)",
      topFillColor2: "rgba(78, 165, 36, 0.04)",
      bottomLineColor: p.down,
      bottomFillColor1: "rgba(245, 61, 70, 0.22)",
      bottomFillColor2: "rgba(245, 61, 70, 0.04)",
      lineWidth: 2,
      lineType,
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
  } else if (isLine) {
    main = chart.addLineSeries({
      color: invertColors ? p.blue : p.up,
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
