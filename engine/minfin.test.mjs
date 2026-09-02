import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMinfinNumber, parseMinfinPrivatHtml } from "./minfin.mjs";

const html = `
<table class='zebra'>
<caption>Курс обміну готівкових валют в КБ&nbsp;Приватбанк на&nbsp;4.06.2026</caption>
<tr><th>Валюта</th></tr>
<tr><td>USD</td><td>долар США</td><td>43,9500</td><td>+0.05</td><td>%</td><td>44,5500</td><td>+0.05</td><td>%</td></tr>
<tr><td>EUR</td><td>Євро</td><td>50,9500</td><td>+0.05</td><td>%</td><td>51,9500</td><td>+0.05</td><td>%</td></tr>
</table>
<table class='zebra'>
<caption>Курс конвертації за платіжними картками КБ&nbsp;Приватбанк на&nbsp;4.06.2026</caption>
<tr><th>Валюта</th></tr>
<tr><td>USD</td><td>долар США</td><td>44,1000</td><td>+0.05</td><td>%</td><td>44,6429</td><td>+0.05</td><td>%</td></tr>
<tr><td>EUR</td><td>Євро</td><td>51,2400</td><td>0</td><td>%</td><td>52,0833</td><td>0</td><td>%</td></tr>
</table>
`;

test("мінфін: кома як десятковий роздільник", () => {
  assert.equal(parseMinfinNumber("52,0833"), 52.0833);
});

test("мінфін: каса і картка з однієї сторінки", () => {
  const parsed = parseMinfinPrivatHtml(html);
  assert.equal(parsed.cash.USD.buy, 43.95);
  assert.equal(parsed.cash.EUR.sale, 51.95);
  assert.equal(parsed.card.USD.buy, 44.1);
  assert.equal(parsed.card.EUR.sale, 52.0833);
});
