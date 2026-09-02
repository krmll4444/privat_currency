import assert from "node:assert/strict";
import { test } from "node:test";
import { toChartColor } from "./charts.js";

test("hsla з темної теми стає rgba для lightweight-charts", () => {
  assert.equal(toChartColor("hsla(0, 0%, 100%, 0.96)", "#fff"), "rgba(255, 255, 255, 0.96)");
  assert.equal(toChartColor("hsla(0, 0%, 100%, 0.15)", "#fff"), "rgba(255, 255, 255, 0.15)");
  assert.equal(toChartColor("#4ea524", "#000"), "#4ea524");
});
