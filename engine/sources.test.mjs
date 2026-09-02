import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBusinessRates } from "./sources.mjs";

test("otp24 widget B/S + nbuRate", () => {
  const parsed = parseBusinessRates({
    cache_info: { from_cache: false },
    USD: {
      B: { rate: "44.4200000", nbuRate: "44.4553000" },
      S: { rate: "44.8200000", nbuRate: "44.4553000" },
    },
    EUR: {
      B: { rate: "51.4000000", nbuRate: "51.5357000" },
      S: { rate: "51.9100000", nbuRate: "51.5357000" },
    },
  });
  assert.equal(parsed.USD.buy, 44.42);
  assert.equal(parsed.EUR.sale, 51.91);
});

test("pubinfo array", () => {
  const parsed = parseBusinessRates([
    { ccy: "USD", buy: "44.1", sale: "44.7" },
    { ccy: "EUR", buy: "50.9", sale: "51.9" },
  ]);
  assert.equal(parsed.USD.buy, 44.1);
});
