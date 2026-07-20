const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  LEGACY_SUNSET,
  setDeprecationHeaders,
} = require("../controllers/datasetController");

test("legacy weekly endpoint publishes deprecation headers", () => {
  const headers = {};
  setDeprecationHeaders({ setHeader: (name, value) => { headers[name] = value; } });
  assert.equal(headers.Deprecation, "true");
  assert.equal(headers.Sunset, LEGACY_SUNSET);
  assert.match(headers.Warning, /legacy/i);
  assert.match(headers.Link, /\/api\/sales\/aggregate/);
});

test("server exposes canonical monthly sales aggregation route", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../server.js"), "utf8");
  assert.match(source, /\/api\/sales/);
  assert.match(source, /salesAggregationRoutes/);
});
