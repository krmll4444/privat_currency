import assert from "node:assert/strict";
import { test } from "node:test";
import { planEurPurchase, percentileRank, toCandles, cutoffMs, sectorKind, favorHistogram, todayAdvice, analyze, applyRankFavorable, buildAdviceFile, sideSignals, cashCompare, waitHorizon, dayDeltaPct, daysUntil, insightItems } from "./money.js";

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
      nbu: { USD: 44, EUR: 51 },
      spread: { favorable: false, lossPer1000UsdUah: 800, edgePct: -2 },
    },
    [
      { business: { USD: { buy: 44 } }, p24: { EUR: { sale: 50 } }, spread: { edgePct: -0.4 } },
      { business: { USD: { buy: 45 } }, p24: { EUR: { sale: 51 } }, spread: { edgePct: -0.5 } },
    ],
    { targetEur: 2000 },
  );
  assert.equal(advice.status, "wait");
  assert.match(advice.title, /не вигідно/i);
  assert.match(advice.action, /2000 EUR/);
  assert.ok(advice.extraUah > 0);
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

test("топ-10% днів робить спред вигідним навіть нижче порогу", () => {
  const hist = [-2, -1.8, -1.6, -1.4, -1.2, -1.0, -0.9, -0.8, -0.7, -0.5];
  const top = applyRankFavorable({ favorable: false, edgePct: -0.4 }, hist, 10);
  assert.equal(top.byThreshold, false);
  assert.equal(top.byTopDays, true);
  assert.equal(top.favorable, true);

  const poor = applyRankFavorable({ favorable: false, edgePct: -1.9 }, hist, 10);
  assert.equal(poor.byTopDays, false);
  assert.equal(poor.favorable, false);

  const thresh = applyRankFavorable({ favorable: true, edgePct: -1.25 }, hist, 10);
  assert.equal(thresh.byThreshold, true);
  assert.equal(thresh.favorable, true);
});

test("advice.json: статус, доплата на профільну суму", () => {
  const file = buildAdviceFile(
    {
      ts: "2026-09-02T10:00:00Z",
      thresholdPct: -1.3,
      targetEur: 2000,
      business: { USD: { buy: 44.42 } },
      p24: { EUR: { sale: 52.08333 } },
      nbu: { USD: 44.4553, EUR: 51.5357 },
      spread: {
        favorable: true,
        byThreshold: true,
        byTopDays: false,
        edgePct: -1.2,
        chainEurPerUsd: 0.85,
      },
    },
    [],
    2000,
  );
  assert.equal(file.status, "do");
  assert.equal(file.targetEur, 2000);
  assert.ok(file.extraUah > 0);
  assert.match(file.action, /2000 EUR/);
});

test("ланцюжок ок не підміняє боки: sell і buy лишаються окремо", () => {
  const advice = todayAdvice(
    {
      business: { USD: { buy: 40 } },
      p24: { EUR: { sale: 55 } },
      spread: { favorable: true, edgePct: -1.2 },
    },
    [
      { business: { USD: { buy: 44 } }, p24: { EUR: { sale: 50 } } },
      { business: { USD: { buy: 45 } }, p24: { EUR: { sale: 51 } } },
    ],
  );
  assert.equal(advice.sellUsd, false);
  assert.equal(advice.buyEur, false);
  assert.match(advice.title, /спред/i);
});

test("вигідно лише продати USD", () => {
  const sides = sideSignals(
    { business: { USD: { buy: 46 } }, p24: { EUR: { sale: 53 } } },
    [
      { business: { USD: { buy: 40 } }, p24: { EUR: { sale: 50 } } },
      { business: { USD: { buy: 41 } }, p24: { EUR: { sale: 51 } } },
      { business: { USD: { buy: 42 } }, p24: { EUR: { sale: 52 } } },
      { business: { USD: { buy: 43 } }, p24: { EUR: { sale: 50.5 } } },
    ],
  );
  assert.equal(sides.sellUsd, true);
  assert.equal(sides.buyEur, false);
});

test("картка vs готівка: премія картки", () => {
  const cash = cashCompare(
    {
      p24: { EUR: { sale: 52.08 } },
      marketCash: { EUR: { sale: 51.95 } },
      business: { USD: { buy: 44.42 } },
    },
    2000,
  );
  assert.equal(cash.plays, false);
  assert.ok(cash.extraUah > 200);
  assert.match(cash.verdict, /не грає/i);
});

test("чекати 5 днів має сенс, якщо історія часто дає +0.3 п.п.", () => {
  const dailyEdges = [];
  for (let i = 0; i < 30; i += 1) {
    dailyEdges.push({ date: `2026-06-${String((i % 28) + 1).padStart(2, "0")}`, edgePct: i % 5 === 0 ? -0.4 : -1.4 });
  }
  const h = waitHorizon({ edgePct: -1.4, daysLeft: 5, dailyEdges, improvePp: 0.3 });
  assert.equal(h.wait, true);
  assert.match(h.text, /5 днів/);
});

test("dayDelta vs перший тік дня", () => {
  const delta = dayDeltaPct(
    { ts: "2026-09-02T18:00:00Z", spread: { edgePct: -1.0 } },
    [
      { ts: "2026-09-02T07:00:00Z", spread: { edgePct: -1.4 } },
      { ts: "2026-09-02T12:00:00Z", spread: { edgePct: -1.2 } },
    ],
  );
  assert.equal(delta, 0.4);
});

test("daysUntil рахує календарні дні", () => {
  assert.equal(daysUntil("2026-09-07", Date.parse("2026-09-02T12:00:00Z")), 5);
});

test("insights: не міняй / стоїть / все одно", () => {
  const items = insightItems({
    status: "wait",
    sellUsd: false,
    buyEur: false,
    dayDelta: 0,
    extraUah: 1318,
    targetEur: 2000,
    cash: { cardEurSale: 52.08, cashEurSale: 52.1, diff: -0.02, extraUah: -33, plays: true },
  });
  assert.equal(items.find((i) => i.id === "now")?.title, "Не міняй");
  assert.equal(items.find((i) => i.id === "day")?.title, "Стоїть");
  assert.equal(items.find((i) => i.id === "cash")?.title, "Все одно");
});

test("insights: продай $ і бери готівку", () => {
  const items = insightItems({
    status: "partial",
    sellUsd: true,
    buyEur: false,
    cash: { cardEurSale: 52.08, cashEurSale: 51.95, diff: 0.13, extraUah: 260, plays: false },
    targetEur: 2000,
  });
  assert.equal(items.find((i) => i.id === "now")?.title, "Продай $");
  assert.equal(items.find((i) => i.id === "now")?.hint, "€ поки не купуй");
  assert.equal(items.find((i) => i.id === "cash")?.title, "Бери готівку");
});

test("insights: почекай до дати", () => {
  const items = insightItems({ status: "wait", daysLeft: 5, wait: true });
  assert.equal(items.find((i) => i.id === "date")?.title, "Почекай");
  assert.match(items.find((i) => i.id === "date")?.hint || "", /5 днів/);
});
