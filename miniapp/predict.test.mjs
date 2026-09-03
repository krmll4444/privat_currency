import assert from "node:assert/strict";
import { test } from "node:test";
import { forecastValues, directionLabel, predictKind } from "./predict.js";

function series(start, step, n) {
  return Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 86400,
    value: start + step * i,
  }));
}

test("зростання: горизонт 3 дні вище за останнє", () => {
  const m = forecastValues(series(40, 0.05, 40), { stepSec: 86400 });
  assert.equal(m.ok, true);
  assert.ok(m.horizons[3].value > m.last);
  assert.ok(m.confidence > 0.2);
});

test("спад: горизонт 3 дні нижче за останнє", () => {
  const m = forecastValues(series(52, -0.04, 40), { stepSec: 86400 });
  assert.equal(m.ok, true);
  assert.ok(m.horizons[3].value < m.last);
});

test("мало точок — без предикту", () => {
  const m = forecastValues(series(44, 0.01, 5), { stepSec: 86400 });
  assert.equal(m.ok, false);
});

test("EUR: вниз = дешевша купівля", () => {
  assert.match(directionLabel("eur", -0.2), /дешевш/i);
  assert.match(directionLabel("usd", 0.2), /вигідніш/i);
});

test("predictKind читає історію snapshot", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 5, 1 + i)).toISOString(),
    business: { USD: { buy: 43 + i * 0.02 } },
    p24: { EUR: { sale: 52 - i * 0.01 } },
    spread: { edgePct: -1.4 + i * 0.01 },
  }));
  const usd = predictKind("usd", rows, { stepSec: 86400 });
  assert.equal(usd.ok, true);
  assert.equal(usd.kind, "usd");
  assert.ok(usd.horizons[1].value);
});
