import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSpread, eurPerUsd, planEurPurchase } from "./calc.mjs";
test("калькулятор: EUR → скільки USD ФОП і втрата vs НБУ", () => {
  const r = planEurPurchase({
    eurAmount: 1000,
    businessUsdBuy: 44.42,
    p24EurSale: 52.08333,
    marketUsd: 44.4553,
    marketEur: 51.5357,
  });
  assert.ok(r.usdFop > 1172 && r.usdFop < 1173);
  assert.ok(r.usdNbu > 1159 && r.usdNbu < 1160);
  assert.ok(r.extraUsd > 13 && r.extraUsd < 14);
});

test("EUR за 1 USD через ланцюжок", () => {
  assert.equal(eurPerUsd(44.4, 52.08333).toFixed(5), (44.4 / 52.08333).toFixed(5));
});

test("відхилення vs НБУ і поріг вигідності", () => {
  const r = computeSpread({
    businessUsdBuy: 44.4,
    p24EurSale: 52.08333,
    marketUsd: 44.4553,
    marketEur: 51.5357,
    thresholdPct: -1.0,
  });

  assert.ok(r.edgePct < -1.1 && r.edgePct > -1.3);
  assert.equal(r.favorable, false);

  const looser = computeSpread({
    businessUsdBuy: 44.4,
    p24EurSale: 52.08333,
    marketUsd: 44.4553,
    marketEur: 51.5357,
    thresholdPct: -1.2,
  });
  assert.equal(looser.favorable, true);
});

test("немає бізнес-курсу — без сигналу", () => {
  const r = computeSpread({
    businessUsdBuy: null,
    p24EurSale: 52,
    marketUsd: 44,
    marketEur: 51,
    thresholdPct: -1,
  });
  assert.equal(r.edgePct, null);
  assert.equal(r.favorable, false);
});
