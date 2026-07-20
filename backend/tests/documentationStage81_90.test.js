const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const required = [
  "docs/01-instalasi-windows.md",
  "docs/02-database-migration-seed.md",
  "docs/03-importer-excel.md",
  "docs/04-forecasting.md",
  "docs/05-deployment.md",
];

test("stage 81-85 documentation files exist and are linked", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  for (const relative of required) {
    assert.equal(fs.existsSync(path.join(root, relative)), true, `${relative} harus tersedia`);
    assert.match(readme, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("inventory freshness update is isolated from monthly_sales target", () => {
  const source = fs.readFileSync(
    path.join(root, "backend/services/inventoryForecastService.js"),
    "utf8",
  );
  assert.match(source, /run\.target = \$2/);
  assert.match(source, /latest_snapshot_period/);
  assert.match(source, /stale_by_months/);
});
