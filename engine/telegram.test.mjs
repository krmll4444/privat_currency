import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAlert, shouldNotify } from "./telegram.mjs";

test("немає сигналу, якщо не вигідно", () => {
  const d = shouldNotify({ spread: { favorable: false } }, {}, 6);
  assert.equal(d.send, false);
});

test("сигнал, якщо вигідно і немає попереднього", () => {
  const d = shouldNotify({ spread: { favorable: true } }, {}, 6);
  assert.equal(d.send, true);
});

test("cooldown глушить повтор", () => {
  const d = shouldNotify(
    { spread: { favorable: true } },
    { lastNotifyAt: new Date().toISOString() },
    6,
  );
  assert.equal(d.send, false);
  assert.equal(d.reason, "cooldown");
});

test("алерт показує доплату на профільну суму EUR", () => {
  const text = formatAlert({
    thresholdPct: -1.3,
    targetEur: 2000,
    notifyTopPct: 10,
    business: { USD: { buy: 44.42 } },
    p24: { EUR: { sale: 52.08333 } },
    spread: {
      chainEurPerUsd: 0.85,
      marketEurPerUsd: 0.86,
      edgePct: -1.2,
      byThreshold: true,
      byTopDays: false,
      lossPer1000UsdUah: 500,
    },
    profile: { extraUah: 1850 },
  });
  assert.match(text, /2000 EUR/);
  assert.match(text, /1850 грн/);
});
