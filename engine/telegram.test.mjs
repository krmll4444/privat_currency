import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldNotify } from "./telegram.mjs";

test("немає сигналу, якщо не вигідно", () => {
  const d = shouldNotify({ spread: { favorable: false } }, {}, 6);
  assert.equal(d.send, false);
});

test("сигнал, якщо вигідно і немає попереднього", () => {
  const d = shouldNotify({ spread: { favorable: true } }, {}, 6);
  assert.equal(d.send, true);
});

test("cooldown глушить повтор", () => {
  const d = shouldNotify(
    { spread: { favorable: true } },
    { lastNotifyAt: new Date().toISOString() },
    6,
  );
  assert.equal(d.send, false);
  assert.equal(d.reason, "cooldown");
});
