import fs from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("./endpoints.js", import.meta.url), "utf8");

test("API endpoints expose current forecast helpers without legacy weekly prediction helpers", () => {
  assert.match(source, /inventoryHistory/);
  assert.match(source, /inventoryForecast/);
  assert.match(source, /latestInventoryForecast/);
  assert.match(source, /salesForecastReadiness/);
  assert.match(source, /\/forecast\/sales\/\$\{id\}\/readiness/);
  assert.match(source, /inventoryRisk/);
  assert.doesNotMatch(source, /prediksiDataset|prediksiChart/);
  assert.doesNotMatch(source, /\/prediksi\/|minggu=/);
});
