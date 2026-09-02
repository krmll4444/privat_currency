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

export function formatAlert(snapshot) {
  const s = snapshot.spread;
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

  return [
    "<b>Вигідне вікно USD → EUR</b>",
    "",
    `ФОП USD buy: <code>${fmt(biz?.USD?.buy, 4)}</code>`,
    `P24 EUR sale: <code>${fmt(p24?.EUR?.sale, 5)}</code>`,
    `Ланцюжок: 1 USD → <b>${fmt(s.chainEurPerUsd, 5)} EUR</b>`,
    `НБУ: 1 USD → ${fmt(s.marketEurPerUsd, 5)} EUR`,
    `Відхилення: <b>${sign}${fmt(s.edgePct, 2)}%</b> (${why})`,
    extraLine,
  ].join("\n");
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

export function shouldNotify(snapshot, state, cooldownHours) {
  if (!snapshot.spread?.favorable) return { send: false, reason: "not-favorable" };

  const lastAt = state.lastNotifyAt ? Date.parse(state.lastNotifyAt) : 0;
  const cooldownMs = cooldownHours * 3600 * 1000;
  if (lastAt && Date.now() - lastAt < cooldownMs) {
    return { send: false, reason: "cooldown" };
  }
  return { send: true, reason: "favorable" };
}
