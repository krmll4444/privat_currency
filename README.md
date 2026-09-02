# Курс ФОП: Rate Engine + Mini App + iOS Widget

Три проєкти в одному репо. Cron на GitHub Actions знімає курси, рахує вигоду ланцюжка **USD (ФОП) → UAH → EUR (Приват24)**, пише історію і, якщо вікно вигідне, шле повідомлення в Telegram. Мініап показує графік у боті, Scriptable — віджет на домашньому екрані.

## Формула

1. Продаєш 1 USD у Приват Бізнес за курсом купівлі банку (`business.USD.buy`).
2. За отримані гривні купуєш EUR у Приват24 за курсом продажу (`p24.EUR.sale`).
3. Скільки EUR вийшло: `business.USD.buy / p24.EUR.sale`.
4. Скільки EUR мало б вийти за НБУ: `nbu.USD / nbu.EUR`.
5. `edgePct = (ланцюжок / НБУ − 1) × 100`. Від’ємне значення — втрата відносно НБУ.

Сигнал, коли `edgePct >= SPREAD_THRESHOLD_PCT` (типово `-1.0`, тобто втрата не більша за 1%). Поріг змінюється змінною репозиторія, без правки коду.

## Джерела курсів

| Джерело | URL | Авторизація |
|---|---|---|
| Приват24, картковий | `api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11` | ні |
| Готівка / міжбанк (довідково) | те саме, `coursid=5` | ні |
| НБУ | `bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json` | ні |
| **Приват Бізнес** | `https://otp24.privatbank.ua/api/1/info/currency/get` | ні |

Це той самий JSON, яким живиться віджет «Курс валют» на [сторінці логіну](https://otp24.privatbank.ua/) (`Купівля` = `B.rate`, `Продаж` = `S.rate`). Autoclient-токен не потрібен.

## Що треба зробити вручну

Код готовий. Далі — ключі, хостинг і віджет на телефоні (постинг бота можна лишити на потім).

### 1. Секрети GitHub

Settings → Secrets and variables → Actions:

- `TELEGRAM_BOT_TOKEN` — `@BotFather`
- `TELEGRAM_CHAT_ID` — свій chat id

Variables (опційно):

- `SPREAD_THRESHOLD_PCT` = `-1.0`
- `NOTIFY_COOLDOWN_HOURS` = `6`
- `NOTIFY_ERRORS` = `1` якщо хочеш помилки фетчу в чат

Actions → General → Workflow permissions → **Read and write**.

### 2. GitHub Pages

Settings → Pages → Source: **GitHub Actions**. Після першого успішного workflow з’явиться URL на кшталт `https://<user>.github.io/<repo>/`.

### 3. Mini App у боті (коли будеш готовий)

`@BotFather` → `/setmenubutton` або inline-кнопка `web_app` з URL сторінки Pages.

### 4. Віджет iPhone

1. App Store: **Scriptable**.
2. Відкрий `widget/RateWidget.js`, заміни `LATEST_URL` на `https://<user>.github.io/<repo>/data/latest.json`.
3. Homescreen → віджет Scriptable → цей скрипт.

iOS сам вирішує, як часто оновлювати віджет (орієнтовно 15–30 хв).

## Локально

```bash
cp .env.example .env   # заповни токени
node --test
node engine/index.mjs --dry-run
npm run preview        # http://127.0.0.1:8080
```

`--dry-run` пише `data/latest.json` і `data/history.jsonl`, але не шле Telegram.

`npm run backfill` підтягує архів ФОП otp24 за 90 днів і дописує денні рядки в `history.jsonl` (картковий EUR оцінюється націнкою з `latest.json`). Живі cron-рядки не затирає.

## Структура

```
engine/     # ядро: fetch, формула, telegram
data/       # latest.json, history.jsonl (крону дописує)
miniapp/    # статична сторінка + Chart.js + Telegram Web App SDK
widget/     # Scriptable JS
```
