import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kyivDay,
  mergeHistory,
  otp24DateToIso,
  p24MarkupFromLatest,
  snapshotFromHistoryDay,
} from "./backfill.mjs";
import { parseOtp24History } from "./sources.mjs";

test("otp24 історія групується по днях USD/EUR", () => {
  const byDate = parseOtp24History({
    data: {
      history: [
        {
          date: "01-07-2026",
          currencyCode: "USD",
          nbuRate: "41.5",
          rate_s: "41.9",
          rate_b: "41.4",
        },
        {
          date: "01-07-2026",
          currencyCode: "EUR",
          nbuRate: "48.2",
          rate_s: "48.7",
          rate_b: "48.0",
        },
      ],
    },
  });
  const day = byDate.get("01-07-2026");
  assert.equal(day.USD.buy, 41.4);
  assert.equal(day.EUR.sale, 48.7);
  assert.equal(day.EUR.nbu, 48.2);
});

test("картковий EUR = ФОП sale × націнка з latest", () => {
  const markup = p24MarkupFromLatest({
    p24: { USD: { buy: 44.3, sale: 44.84 }, EUR: { buy: 51.25, sale: 52.08333 } },
    business: { USD: { buy: 44.42, sale: 44.82 }, EUR: { buy: 51.4, sale: 51.91 } },
  });
  assert.ok(markup.eurSale > 1.003 && markup.eurSale < 1.004);

  const estimated = snapshotFromHistoryDay(
    "01-07-2026",
    {
      USD: { buy: 41.4, sale: 41.9, nbu: 41.5 },
      EUR: { buy: 48.0, sale: 48.7, nbu: 48.2 },
    },
    { markup, thresholdPct: -1 },
  );
  assert.equal(estimated.p24Estimated, true);
  assert.ok(Math.abs(estimated.p24.EUR.sale - 48.7 * markup.eurSale) < 1e-4);

  const snap = snapshotFromHistoryDay(
    "01-07-2026",
    {
      USD: { buy: 41.4, sale: 41.9, nbu: 41.5 },
      EUR: { buy: 48.0, sale: 48.7, nbu: 48.2 },
    },
    {
      markup,
      thresholdPct: -1,
      minfin: {
        card: { USD: { buy: 41.2, sale: 41.8 }, EUR: { buy: 47.9, sale: 49.1 } },
        cash: { USD: { buy: 41.1, sale: 41.7 }, EUR: { buy: 47.8, sale: 48.9 } },
      },
    },
  );
  assert.equal(snap.backfill, true);
  assert.equal(snap.p24Estimated, false);
  assert.equal(snap.ts, otp24DateToIso("01-07-2026"));
  assert.equal(snap.p24.EUR.sale, 49.1);
  assert.equal(snap.p24.source, "minfin-card");
  assert.equal(snap.marketCash.EUR.sale, 48.9);
  assert.equal(snap.business.USD.buy, 41.4);
  assert.ok(snap.spread.edgePct != null);
});

test("бекфіл не затирає живі дні cron", () => {
  const live = {
    ts: "2026-09-02T19:03:12.784Z",
    backfill: false,
    business: { USD: { buy: 44.42 } },
  };
  const fill = {
    ts: otp24DateToIso("02-09-2026"),
    backfill: true,
  };
  const older = {
    ts: otp24DateToIso("01-07-2026"),
    backfill: true,
  };
  const merged = mergeHistory([live], [fill, older]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((r) => kyivDay(r.ts) === "2026-09-02").backfill, false);
  assert.equal(merged[0].ts, older.ts);
});
