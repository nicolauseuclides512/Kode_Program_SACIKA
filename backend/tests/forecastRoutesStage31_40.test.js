const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "../routes/forecastRoutes.js"), "utf8");

test("batch forecast and actual evaluation routes are admin-only", () => {
  assert.match(source, /\/inventory\/batch/);
  assert.match(source, /\/inventory\/evaluate-actuals/);
  assert.match(source, /allowRoles\("admin"\)/);
  assert.match(source, /createInventoryForecastBatch/);
  assert.match(source, /evaluateInventoryForecasts/);
});
