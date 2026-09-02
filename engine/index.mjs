import { loadEnv } from "./load-env.mjs";
import { computeSpread, round, snapshotRates } from "./calc.mjs";
import { fetchAll } from "./sources.mjs";
import {
  appendHistory,
  readHistory,
  readState,
  writeAdvice,
  writeLatest,
  writeState,
} from "./store.mjs";
import {
  formatAlert,
  formatError,
  sendTelegram,
  shouldNotify,
} from "./telegram.mjs";
import {
  applyRankFavorable,
  buildAdviceFile,
  planEurPurchase,
} from "../miniapp/money.js";

loadEnv();

const dryRun = process.argv.includes("--dry-run");
const noTelegram = process.argv.includes("--no-telegram") || dryRun;

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const thresholdPct = envNumber("SPREAD_THRESHOLD_PCT", -1.3);
  const cooldownHours = envNumber("NOTIFY_COOLDOWN_HOURS", 6);
  const targetEur = envNumber("TARGET_EUR", 2000);
  const notifyTopPct = envNumber("NOTIFY_TOP_PCT", 10);

  const history = await readHistory();
  const { p24, market, nbu, business } = await fetchAll();

  const rawSpread = computeSpread({
    businessUsdBuy: business.USD?.buy,
    p24EurSale: p24.EUR?.sale,
    marketUsd: nbu.USD,
    marketEur: nbu.EUR,
    thresholdPct,
  });
  const spread = applyRankFavorable(
    rawSpread,
    history.map((row) => row.spread?.edgePct),
    notifyTopPct,
  );
  const plan = planEurPurchase({
    eurAmount: targetEur,
    businessUsdBuy: business.USD?.buy,
    p24EurSale: p24.EUR?.sale,
    marketUsd: nbu.USD,
    marketEur: nbu.EUR,
  });

  const snapshot = {
    ts: new Date().toISOString(),
    thresholdPct,
    targetEur,
    notifyTopPct,
    p24: {
      USD: snapshotRates(p24.USD),
      EUR: snapshotRates(p24.EUR),
    },
    business: {
      USD: snapshotRates(business.USD),
      EUR: snapshotRates(business.EUR),
      source: business.source,
    },
    marketCash: {
      USD: snapshotRates(market.USD),
      EUR: snapshotRates(market.EUR),
    },
    nbu: {
      USD: round(nbu.USD, 4),
      EUR: round(nbu.EUR, 4),
    },
    spread: {
      chainEurPerUsd: round(spread.chainEurPerUsd, 6),
      marketEurPerUsd: round(spread.marketEurPerUsd, 6),
      edgePct: round(spread.edgePct, 3),
      lossPct: round(spread.lossPct, 3),
      lossPer1000UsdUah: round(spread.lossPer1000UsdUah, 2),
      favorable: spread.favorable,
      byThreshold: spread.byThreshold,
      byTopDays: spread.byTopDays,
      edgeRank: spread.edgeRank,
    },
    profile: plan
      ? {
          extraUah: round(plan.extraUah, 0),
          extraUsd: round(plan.extraUsd, 2),
          usdFop: round(plan.usdFop, 2),
          uahNeeded: round(plan.uahNeeded, 0),
        }
      : null,
  };

  const rows = [...history, snapshot];
  await writeLatest(snapshot);
  await appendHistory(snapshot);
  await writeAdvice(buildAdviceFile(snapshot, rows, targetEur));

  const state = await readState();
  const decision = shouldNotify(snapshot, state, cooldownHours);

  console.log(
    JSON.stringify(
      {
        ts: snapshot.ts,
        edgePct: snapshot.spread.edgePct,
        favorable: snapshot.spread.favorable,
        byThreshold: snapshot.spread.byThreshold,
        byTopDays: snapshot.spread.byTopDays,
        extraUah: snapshot.profile?.extraUah ?? null,
        notify: decision,
      },
      null,
      2,
    ),
  );

  if (decision.send && !noTelegram) {
    await sendTelegram(formatAlert(snapshot));
    await writeState({
      ...state,
      lastNotifyAt: snapshot.ts,
      lastEdgePct: snapshot.spread.edgePct,
    });
  }
}

main().catch(async (err) => {
  console.error(err);
  if (process.env.NOTIFY_ERRORS === "1" && !noTelegram) {
    try {
      await sendTelegram(formatError(err));
    } catch (telegramErr) {
      console.error(telegramErr);
    }
  }
  process.exit(1);
});
