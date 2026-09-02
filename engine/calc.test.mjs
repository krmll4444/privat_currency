import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSpread, eurPerUsd } from "./calc.mjs";

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
