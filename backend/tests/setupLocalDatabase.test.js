const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertSafeEnvironment,
  buildSetupPlan,
  parseArgs,
  validateOptions,
} = require("../scripts/setupLocalDatabase");

test("setup lokal menolak production dan DATABASE_URL kosong", () => {
  assert.throws(
    () => assertSafeEnvironment({ NODE_ENV: "production", DATABASE_URL: "postgres://x" }),
    /production/,
  );
  assert.throws(
    () => assertSafeEnvironment({ NODE_ENV: "development" }),
    /DATABASE_URL/,
  );
});

test("parseArgs dan buildSetupPlan menghasilkan urutan yang aman", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-setup-"));
  const inventoryFile = path.join(tempDir, "history.xlsx");
  fs.writeFileSync(inventoryFile, "placeholder");

  const options = parseArgs([
    "node",
    "setupLocalDatabase.js",
    "--inventory-file",
    inventoryFile,
    "--commit-products",
    "--import-inventory",
    "--sync-current-stock",
  ]);
  validateOptions(options);
  const names = buildSetupPlan(options).map((step) => step.name);

  assert.deepEqual(names, [
    "migration",
    "seed",
    "bootstrap-products-dry-run",
    "bootstrap-products-commit",
    "import-inventory-dry-run",
    "import-inventory-commit",
    "sync-current-stock-dry-run",
    "sync-current-stock-commit",
    "database-health-check",
  ]);
});

test("sinkronisasi stok tanpa import ditolak", () => {
  assert.throws(
    () => validateOptions({
      inventoryFile: "history.xlsx",
      commitProducts: false,
      importInventory: false,
      syncCurrentStock: true,
    }),
    /bersama --import-inventory/,
  );
});
