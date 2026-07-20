const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationPath = path.join(
  __dirname,
  "../migrations/202607170001_create_core_schema.up.sql",
);
const rollbackPath = path.join(
  __dirname,
  "../migrations/202607170001_create_core_schema.down.sql",
);

const migration = fs.readFileSync(migrationPath, "utf8");
const rollback = fs.readFileSync(rollbackPath, "utf8");

test("core schema migration defines all required base tables", () => {
  for (const table of [
    "pengguna",
    "kategori",
    "produk",
    "transaksi",
    "dataset_mingguan",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("core schema uses password_hash, role, and is_active", () => {
  assert.match(migration, /password_hash TEXT NOT NULL/);
  assert.match(migration, /role TEXT NOT NULL DEFAULT 'staff'/);
  assert.match(migration, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.doesNotMatch(migration, /\bpassword TEXT\b/);
});

test("core schema rollback removes tables in dependency-safe order", () => {
  const weeklyIndex = rollback.indexOf("DROP TABLE IF EXISTS dataset_mingguan");
  const transactionIndex = rollback.indexOf("DROP TABLE IF EXISTS transaksi");
  const productIndex = rollback.indexOf("DROP TABLE IF EXISTS produk");
  const categoryIndex = rollback.indexOf("DROP TABLE IF EXISTS kategori");
  const userIndex = rollback.indexOf("DROP TABLE IF EXISTS pengguna");

  assert.ok(weeklyIndex < transactionIndex);
  assert.ok(transactionIndex < productIndex);
  assert.ok(productIndex < categoryIndex);
  assert.ok(categoryIndex < userIndex);
});
