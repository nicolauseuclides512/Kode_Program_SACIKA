const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");

test("legacy weekly prediction route is no longer mounted", () => {
  assert.doesNotMatch(serverSource, /prediksiRoutes/);
  assert.doesNotMatch(serverSource, /\/api\/prediksi/);
});

test("monthly inventory forecast route remains mounted", () => {
  assert.match(serverSource, /forecastRoutes/);
  assert.match(serverSource, /\/api\/forecast/);
});
