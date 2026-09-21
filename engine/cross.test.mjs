import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCrossSnapshot,
  crossNotifyKinds,
  formatCrossAlert,
  isNightWindow,
  nbuEurUsd,
  privatEurUsd,
  shouldNotifyCross,
  toPips,
} from "./cross.mjs";

test("privat/nbu EURUSD = USD за 1 EUR", () => {
  assert.ok(Math.abs(privatEurUsd(44.47, 52.08333) - 1.1712) < 1e-4);
  assert.ok(Math.abs(nbuEurUsd(44.6093, 51.6433) - 1.15768) < 1e-4);
});

test("pips", () => {
  assert.equal(toPips(0.002), 20);
  assert.equal(toPips(-0.0015), -15);
});

test("нічне вікно Київ", () => {
  // 2026-09-21 21:30 UTC = 00:30 Київ (UTC+3 у вересні? actually Kyiv is EEST UTC+3 in Sep)
  // 2026-09-21T07:00:00Z = 10:00 Київ → day starts
  assert.equal(isNightWindow(Date.parse("2026-09-21T20:30:00Z")), true); // 23:30 Kyiv
  assert.equal(isNightWindow(Date.parse("2026-09-21T06:59:00Z")), true); // 09:59 Kyiv
  assert.equal(isNightWindow(Date.parse("2026-09-21T07:00:00Z")), false); // 10:00 Kyiv
  assert.equal(isNightWindow(Date.parse("2026-09-21T12:00:00Z")), false); // 15:00 Kyiv
});

test("buildCross: зазор і stale вдень", () => {
  const cross = buildCrossSnapshot({
    market: { eurUsd: 1.14, prevClose: 1.15, source: "yahoo", asOf: "2026-09-21T12:00:00Z" },
    businessUsdBuy: 44.5,
    p24EurSale: 52.0,
    nbuUsd: 44.6,
    nbuEur: 51.6,
    prevMarketEurUsd: 1.145,
    prevPrivatEurUsd: 1.1685,
    ts: Date.parse("2026-09-21T12:00:00Z"),
  });
  assert.equal(cross.nightWindow, false);
  assert.ok(cross.lagPips > 100);
  assert.equal(cross.follow, "stale");
});

test("алерт: спад і підлога 1.13", () => {
  const kinds = crossNotifyKinds(
    { eurUsd: 1.128, nightWindow: false, follow: "tracking", marketMovePips: -120 },
    { lastCrossRate: 1.14 },
    { floor: 1.13, nearFloor: 1.135, dropPips: 20 },
  );
  assert.ok(kinds.includes("cross-drop"));
  assert.ok(kinds.includes("cross-floor"));
});

test("алерт: біля 1.13", () => {
  const kinds = crossNotifyKinds(
    { eurUsd: 1.133, nightWindow: false },
    { lastCrossRate: 1.133 },
    { floor: 1.13, nearFloor: 1.135, dropPips: 20 },
  );
  assert.deepEqual(kinds, ["cross-near"]);
});

test("near-floor пробиває кулдаун", () => {
  const d = shouldNotifyCross(
    { eurUsd: 1.132, nightWindow: false },
    {
      lastCrossNotifyAt: new Date().toISOString(),
      lastCrossKinds: ["cross-drop"],
      lastCrossRate: 1.14,
    },
    6,
    { floor: 1.13, nearFloor: 1.135, dropPips: 20 },
  );
  assert.equal(d.send, true);
  assert.equal(d.reason, "cross-near");
});

test("formatCrossAlert згадує крос і зазор", () => {
  const text = formatCrossAlert({
    crossFloor: 1.13,
    crossNear: 1.135,
    cross: {
      eurUsd: 1.129,
      source: "yahoo",
      prevClose: 1.14,
      nbuEurUsd: 1.146,
      privatEurUsd: 1.164,
      lagPips: 350,
      lagPct: 3.1,
      nightWindow: true,
      followHint: "Нічне вікно",
    },
  });
  assert.match(text, /1\.1290/);
  assert.match(text, /350 п/);
  assert.match(text, /Нічне вікно/);
});
