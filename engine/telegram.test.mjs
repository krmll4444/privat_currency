import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAlert, isTelegramSoundHours, shouldNotify } from "./telegram.mjs";

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
    sides: { sellUsd: true, buyEur: false, usdRank: 82, eurRank: 61 },
    dayDelta: 0.31,
    cash: { verdict: "Картка EUR дорожча за готівку Приват на 0.13 грн." },
    advice: { title: "Вигідно продати USD", waitText: "Зачекати ще 5 днів має сенс, якщо ловиш кращий день." },
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
  assert.match(text, /вигідно продати/i);
  assert.match(text, /поки дорого/);
  assert.match(text, /0\.31 п\.п/);
  assert.match(text, /готівку/);
  assert.match(text, /5 днів/);
});

test("сигнал з одного боку, навіть якщо ланцюжок поганий", () => {
  const d = shouldNotify(
    { spread: { favorable: false }, sides: { sellUsd: true, buyEur: false } },
    {},
    6,
  );
  assert.equal(d.send, true);
  assert.equal(d.reason, "sell-usd");
});

test("алерт про покращення на 0.3 п.п. за день", () => {
  const d = shouldNotify(
    { spread: { favorable: false, edgePct: -1.0 }, sides: {}, dayDelta: 0.31, improvePp: 0.3 },
    {},
    6,
  );
  assert.equal(d.send, true);
  assert.equal(d.reason, "improved");
});

test("новий бік пробиває cooldown", () => {
  const d = shouldNotify(
    { spread: { favorable: false }, sides: { sellUsd: false, buyEur: true } },
    { lastNotifyAt: new Date().toISOString(), lastNotifyKinds: ["sell-usd"], lastEdgePct: -1.4 },
    6,
  );
  assert.equal(d.send, true);
  assert.equal(d.reason, "buy-eur");
});

test("звук лише пн–пт 08:00–19:00 Київ", () => {
  // 2026-09-28 = понеділок, Київ = UTC+3 (літо)
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-28T04:59:00Z")), false); // 07:59
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-28T05:00:00Z")), true); // 08:00
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-28T15:59:00Z")), true); // 18:59
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-28T16:00:00Z")), false); // 19:00
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-26T09:00:00Z")), false); // субота
  assert.equal(isTelegramSoundHours(Date.parse("2026-09-27T12:00:00Z")), false); // неділя
});
