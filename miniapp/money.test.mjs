import assert from "node:assert/strict";
import { test } from "node:test";
import { planEurPurchase, percentileRank, toCandles, cutoffMs } from "./money.js";

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
