import { loadEnv } from "./load-env.mjs";

loadEnv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Немає TELEGRAM_BOT_TOKEN у .env");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();
if (!data.ok) {
  console.error("Telegram error:", data.description || data);
  process.exit(1);
}

const chats = new Map();
for (const update of data.result ?? []) {
  const chat =
    update.message?.chat ||
    update.edited_message?.chat ||
    update.my_chat_member?.chat ||
    update.channel_post?.chat;
  if (!chat) continue;
  chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.log("Немає оновлень. Відкрий t.me/privat_4444_currency_bot, натисни Start і запусти скрипт ще раз.");
  process.exit(2);
}

console.log("Знайдені чати:");
for (const chat of chats.values()) {
  const name = [chat.first_name, chat.last_name, chat.username && `@${chat.username}`]
    .filter(Boolean)
    .join(" ");
  console.log(`${chat.id}\t${chat.type}\t${name}`);
}
