/**
 * Ланцюжок: продай 1 USD у Приват Бізнес (банк купує USD) → UAH → купи EUR у Приват24 (банк продає EUR).
 * Порівняння з офіційним крос-курсом НБУ.
 */

export function eurPerUsd(usdBuy, eurSale) {
  if (!usdBuy || !eurSale) return null;
  return usdBuy / eurSale;
}

export function computeSpread({
  businessUsdBuy,
  p24EurSale,
  marketUsd,
  marketEur,
  thresholdPct,
}) {
  const chainEurPerUsd = eurPerUsd(businessUsdBuy, p24EurSale);
  const marketEurPerUsd = eurPerUsd(marketUsd, marketEur);

  if (chainEurPerUsd == null || marketEurPerUsd == null) {
    return {
      chainEurPerUsd: chainEurPerUsd,
      marketEurPerUsd: marketEurPerUsd,
      edgePct: null,
      lossPct: null,
      lossPer1000UsdUah: null,
      favorable: false,
    };
  }

  const edgePct = (chainEurPerUsd / marketEurPerUsd - 1) * 100;
  const lossPct = -edgePct;
  const actualEur = 1000 * chainEurPerUsd;
  const marketEurAmt = 1000 * marketEurPerUsd;
  const lostEur = marketEurAmt - actualEur;
  const lossPer1000UsdUah = lostEur * marketEur;

  return {
    chainEurPerUsd,
    marketEurPerUsd,
    edgePct,
    lossPct,
    lossPer1000UsdUah,
    favorable: edgePct >= thresholdPct,
  };
}

export function round(value, digits = 5) {
  if (value == null || Number.isNaN(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function snapshotRates(pair) {
  if (!pair) return null;
  return {
    buy: round(pair.buy, 5),
    sale: round(pair.sale, 5),
  };
}

/**
 * Скільки USD на ФОП треба продати, щоб купити eurAmount у Приват24.
 */
export function planEurPurchase({
  eurAmount,
  businessUsdBuy,
  p24EurSale,
  marketUsd,
  marketEur,
}) {
  if (!eurAmount || !businessUsdBuy || !p24EurSale) {
    return null;
  }

  const uahNeeded = eurAmount * p24EurSale;
  const usdFop = uahNeeded / businessUsdBuy;
  const usdNbu =
    marketUsd && marketEur ? (eurAmount * marketEur) / marketUsd : null;
  const extraUsd = usdNbu != null ? usdFop - usdNbu : null;
  const extraUah = extraUsd != null ? extraUsd * businessUsdBuy : null;
  const lossPct = usdNbu ? (usdFop / usdNbu - 1) * 100 : null;

  return {
    eurAmount,
    usdFop,
    usdNbu,
    uahNeeded,
    extraUsd,
    extraUah,
    lossPct,
  };
}
