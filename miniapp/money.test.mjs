import assert from "node:assert/strict";
import { test } from "node:test";
import { planEurPurchase, percentileRank, toCandles, cutoffMs, sectorKind, favorHistogram, todayAdvice, analyze } from "./money.js";

test("калькулятор на живих курсах", () => {
  const r = planEurPurchase({
    eurAmount: 1000,
    businessUsdBuy: 44.42,
    p24EurSale: 52.08333,
    marketUsd: 44.4553,
    marketEur: 51.5357,
  });
  assert.ok(r.usdFop > 1172 && r.usdFop < 1173);
  assert.ok(r.extraUsd > 13 && r.extraUsd < 14);
});

test("свічки групують тіки", () => {
  const candles = toCandles(
    [
      { time: 1000, value: 44.1 },
      { time: 1100, value: 44.4 },
      { time: 2000, value: 44.2 },
    ],
    1000,
  );
  assert.equal(candles.length, 2);
  assert.equal(candles[0].open, 44.1);
  assert.equal(candles[0].high, 44.4);
  assert.equal(candles[0].close, 44.4);
});

test("перцентиль: вище = кращий продаж USD", () => {
  assert.equal(percentileRank(5, [1, 2, 3, 4, 5]), 80);
});

test("cutoff 90d", () => {
  const from = cutoffMs("90d");
  const span = Date.now() - from;
  assert.ok(span > 89 * 24 * 3600 * 1000 && span < 91 * 24 * 3600 * 1000);
});

test("сектори вигоди: плюс / нуль / мін. втрата", () => {
  assert.equal(sectorKind(0.4, -1), "profit");
  assert.equal(sectorKind(0, -1), "zero");
  assert.equal(sectorKind(-0.4, -1), "low-loss");
  assert.equal(sectorKind(-1.4, -1), null);
  const bars = favorHistogram(
    [{ time: 1, close: 0.2 }, { time: 2, close: -0.3 }, { time: 3, close: -2 }],
    -1,
  );
  assert.equal(bars[0].value, 1);
  assert.equal(bars[1].value, 1);
  assert.equal(bars[2].value, 0);
});

test("порада на сьогодні: чекати, якщо спред поганий", () => {
  const advice = todayAdvice(
    {
      business: { USD: { buy: 40 } },
      p24: { EUR: { sale: 55 } },
      spread: { favorable: false, lossPer1000UsdUah: 800, edgePct: -2 },
    },
    [
      { business: { USD: { buy: 44 } }, p24: { EUR: { sale: 50 } }, spread: { edgePct: -0.4 } },
      { business: { USD: { buy: 45 } }, p24: { EUR: { sale: 51 } }, spread: { edgePct: -0.5 } },
    ],
  );
  assert.equal(advice.status, "wait");
  assert.match(advice.title, /не вигідно/i);
});

test("аналіз віддає тон для підсвітки абзаців", () => {
  const notes = analyze(
    [
      { ts: "2026-01-01T00:00:00Z", business: { USD: { buy: 44 } }, p24: { EUR: { sale: 51 } }, spread: { edgePct: -0.4, favorable: true } },
      { ts: "2026-01-02T00:00:00Z", business: { USD: { buy: 45 } }, p24: { EUR: { sale: 50 } }, spread: { edgePct: -0.3, favorable: true } },
    ],
    {
      business: { USD: { buy: 45 } },
      p24: { EUR: { sale: 50 } },
      spread: { favorable: true, edgePct: -0.3, lossPer1000UsdUah: 120 },
    },
  );
  assert.ok(notes.every((n) => n.text && n.tone));
  assert.ok(notes.some((n) => n.tone === "sell" || n.tone === "both" || n.tone === "buy"));
});
