import { loadEnv } from "./load-env.mjs";

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
const url = (process.env.MINIAPP_URL || "https://krmll4444.github.io/privat_currency/").replace(
  /\/?$/,
  "/",
);
const text = process.env.MINIAPP_BUTTON_TEXT || "Курс ФОП";

if (!token) {
  console.error("Немає TELEGRAM_BOT_TOKEN у .env");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    menu_button: {
      type: "web_app",
      text,
      web_app: { url },
    },
  }),
});

const data = await res.json();
if (!data.ok) {
  console.error("Telegram error:", data.description || data);
  process.exit(1);
}

console.log(`Кнопка Mini App: «${text}» → ${url}`);
