import { notifyKinds } from "../miniapp/money.js";

const API = "https://api.telegram.org";

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram: немає TELEGRAM_BOT_TOKEN або TELEGRAM_CHAT_ID — пропуск.");
    return false;
  }

  const res = await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

function fmt(n, digits = 4) {
  if (n == null || Number.isNaN(n)) return "—";
  return Number(n).toFixed(digits);
}

function rankUsd(rank) {
  if (rank == null) return "";
  return ` (${fmt(rank, 0)}-й перцентиль)`;
}

function rankEur(rank) {
  if (rank == null) return "";
  return rank <= 30
    ? ` (дешевше, ніж у ${fmt(100 - rank, 0)}% історії)`
    : ` (${fmt(rank, 0)}-й перцентиль)`;
}

export function formatAlert(snapshot) {
  const s = snapshot.spread || {};
  const sides = snapshot.sides || {};
  const advice = snapshot.advice || {};
  const biz = snapshot.business;
  const p24 = snapshot.p24;
  const sign = s.edgePct >= 0 ? "+" : "";
  const targetEur = snapshot.targetEur;
  const extraUah = snapshot.profile?.extraUah;
  const why = s.byTopDays && !s.byThreshold
    ? `топ-${fmt(snapshot.notifyTopPct, 0)}% днів історії`
    : `поріг ${fmt(snapshot.thresholdPct, 2)}%`;
  const extraLine =
    extraUah != null && targetEur
      ? `Доплата на ${targetEur} EUR: ~${fmt(extraUah, 0)} грн`
      : `Втрата на 1000 USD: ~${fmt(s.lossPer1000UsdUah, 0)} грн`;
  const usdLine = sides.sellUsd
    ? `USD ФОП: <b>вигідно продати</b>${rankUsd(sides.usdRank)}`
    : `USD ФОП: не пік продажу${rankUsd(sides.usdRank)}`;
  const eurLine = sides.buyEur
    ? `EUR картка: <b>вигідно купити</b>${rankEur(sides.eurRank)}`
    : `EUR картка: поки дорого${rankEur(sides.eurRank)}`;
  const dayLine =
    snapshot.dayDelta == null
      ? null
      : `За день: <b>${snapshot.dayDelta >= 0 ? "+" : ""}${fmt(snapshot.dayDelta, 2)} п.п.</b>`;

  return [
    `<b>${advice.title || "Сигнал USD → EUR"}</b>`,
    "",
    usdLine,
    eurLine,
    "",
    `ФОП USD buy: <code>${fmt(biz?.USD?.buy, 4)}</code>`,
    `P24 EUR sale: <code>${fmt(p24?.EUR?.sale, 5)}</code>`,
    `Ланцюжок: 1 USD → <b>${fmt(s.chainEurPerUsd, 5)} EUR</b>`,
    `НБУ: 1 USD → ${fmt(s.marketEurPerUsd, 5)} EUR`,
    `Відхилення: <b>${sign}${fmt(s.edgePct, 2)}%</b> (${why})`,
    extraLine,
    dayLine,
    snapshot.cash?.verdict || null,
    advice.waitText || null,
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function formatError(err) {
  return `<b>Rate engine: помилка</b>\n<code>${escapeHtml(String(err.message || err))}</code>`;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function shouldNotify(snapshot, state, cooldownHours, { improvePp = 0.3 } = {}) {
  const kinds = notifyKinds(snapshot, { improvePp: snapshot.improvePp ?? improvePp });
  if (!kinds.length) return { send: false, reason: "quiet", kinds };

  const lastAt = state.lastNotifyAt ? Date.parse(state.lastNotifyAt) : 0;
  const cooldownMs = cooldownHours * 3600 * 1000;
  const cooled = !lastAt || Date.now() - lastAt >= cooldownMs;
  const lastKinds = new Set(
    state.lastNotifyKinds || (state.lastNotifyKind ? [state.lastNotifyKind] : []),
  );
  const fresh = kinds.filter((k) => !lastKinds.has(k));
  const pp = snapshot.improvePp ?? improvePp;
  const improvedEnough =
    snapshot.spread?.edgePct != null &&
    state.lastEdgePct != null &&
    snapshot.spread.edgePct - state.lastEdgePct >= pp;

  if (cooled) return { send: true, reason: kinds[0], kinds };
  if (!lastKinds.size) return { send: false, reason: "cooldown", kinds };
  const usable = fresh.filter((k) => k !== "improved" || improvedEnough || state.lastEdgePct == null);
  if (usable.length) return { send: true, reason: usable[0], kinds: usable };
  return { send: false, reason: "cooldown", kinds };
}
