import { computeSpread, round, snapshotRates } from "./calc.mjs";
import { fetchMinfinPrivatRange } from "./minfin.mjs";
import { fetchBusinessHistory, uaDate } from "./sources.mjs";
import { latestPath, readHistory, readJson, writeHistory } from "./store.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || process.argv[i + 1] == null) return fallback;
  return process.argv[i + 1];
}

export function otp24DateToYmd(dateStr) {
  const [dd, mm, yyyy] = String(dateStr).split("-");
  return `${yyyy}-${mm}-${dd}`;
}

export function otp24DateToIso(dateStr) {
  return `${otp24DateToYmd(dateStr)}T10:00:00.000Z`;
}

export function kyivDay(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function p24MarkupFromLatest(latest) {
  const biz = latest?.business;
  const p24 = latest?.p24;
  const ratio = (a, b) => (a && b ? a / b : 1);
  return {
    usdBuy: ratio(p24?.USD?.buy, biz?.USD?.buy),
    usdSale: ratio(p24?.USD?.sale, biz?.USD?.sale),
    eurBuy: ratio(p24?.EUR?.buy, biz?.EUR?.buy),
    eurSale: ratio(p24?.EUR?.sale, biz?.EUR?.sale),
  };
}

export function mergeHistory(existing, backfill) {
  const liveDays = new Set();
  for (const row of existing) {
    if (!row?.ts || row.backfill) continue;
    liveDays.add(kyivDay(row.ts));
  }
  const live = existing.filter((row) => row?.ts && !row.backfill);
  const extra = backfill.filter((row) => row?.ts && !liveDays.has(kyivDay(row.ts)));
  return [...live, ...extra].sort((a, b) => a.ts.localeCompare(b.ts));
}

export function snapshotFromHistoryDay(dateStr, day, { markup, minfin, thresholdPct }) {
  const usd = day.USD;
  const eur = day.EUR;
  if (!usd?.buy || !eur?.sale || !usd.nbu || !eur.nbu) return null;

  const business = {
    USD: { buy: usd.buy, sale: usd.sale },
    EUR: { buy: eur.buy, sale: eur.sale },
  };
  const card = minfin?.card;
  const cash = minfin?.cash;
  const p24Estimated = !card?.EUR?.sale;
  const p24 = p24Estimated
    ? {
        USD: {
          buy: usd.buy * markup.usdBuy,
          sale: usd.sale * markup.usdSale,
        },
        EUR: {
          buy: eur.buy * markup.eurBuy,
          sale: eur.sale * markup.eurSale,
        },
      }
    : card;

  const spread = computeSpread({
    businessUsdBuy: business.USD.buy,
    p24EurSale: p24.EUR.sale,
    marketUsd: usd.nbu,
    marketEur: eur.nbu,
    thresholdPct,
  });

  return {
    ts: otp24DateToIso(dateStr),
    thresholdPct,
    backfill: true,
    p24Estimated,
    p24: {
      USD: snapshotRates(p24.USD),
      EUR: snapshotRates(p24.EUR),
      source: p24Estimated ? "otp24-history+markup" : "minfin-card",
    },
    business: {
      USD: snapshotRates(business.USD),
      EUR: snapshotRates(business.EUR),
      source: "otp24-history",
    },
    marketCash: cash?.EUR?.sale
      ? {
          USD: snapshotRates(cash.USD),
          EUR: snapshotRates(cash.EUR),
          source: "minfin-cash",
        }
      : null,
    nbu: {
      USD: round(usd.nbu, 4),
      EUR: round(eur.nbu, 4),
    },
    spread: {
      chainEurPerUsd: round(spread.chainEurPerUsd, 6),
      marketEurPerUsd: round(spread.marketEurPerUsd, 6),
      edgePct: round(spread.edgePct, 3),
      lossPct: round(spread.lossPct, 3),
      lossPer1000UsdUah: round(spread.lossPer1000UsdUah, 2),
      favorable: spread.favorable,
    },
  };
}

async function main() {
  const days = Number(argValue("--days", "90"));
  const dryRun = process.argv.includes("--dry-run");
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);

  const sDate = uaDate(start);
  const eDate = uaDate(end);
  const latest = await readJson(latestPath, {});
  const markup = p24MarkupFromLatest(latest);
  const thresholdPct =
    latest?.thresholdPct != null ? Number(latest.thresholdPct) : -1;

  const [byDate, minfinByDay] = await Promise.all([
    fetchBusinessHistory({ sDate, eDate }),
    fetchMinfinPrivatRange(start, end),
  ]);
  const backfill = [];
  let minfinHits = 0;
  for (const [dateStr, day] of byDate) {
    const minfin = minfinByDay.get(otp24DateToYmd(dateStr));
    if (minfin?.card?.EUR?.sale) minfinHits += 1;
    const snap = snapshotFromHistoryDay(dateStr, day, {
      markup,
      minfin,
      thresholdPct,
    });
    if (snap) backfill.push(snap);
  }

  const existing = await readHistory();
  const merged = mergeHistory(existing, backfill);

  console.log(
    JSON.stringify(
      {
        range: { sDate, eDate },
        otp24Days: byDate.size,
        minfinDays: minfinByDay.size,
        minfinCardHits: minfinHits,
        backfillRows: backfill.length,
        keptLive: existing.filter((r) => !r.backfill).length,
        mergedRows: merged.length,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (!dryRun) await writeHistory(merged);
}

const isCli =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
