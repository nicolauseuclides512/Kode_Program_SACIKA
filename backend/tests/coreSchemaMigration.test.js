const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationsDir = path.join(__dirname, "../migrations");
const upFile = "202607170001_add_core_schema.up.sql";
const downFile = "202607170001_add_core_schema.down.sql";
const advancedInventoryMigration = "202607180001_add_inventory_history_forecast.up.sql";

const upSql = fs.readFileSync(path.join(migrationsDir, upFile), "utf8");
const downSql = fs.readFileSync(path.join(migrationsDir, downFile), "utf8");

function assertTableCreatedBefore(firstTable, secondTable) {
  const firstIndex = upSql.indexOf(`CREATE TABLE IF NOT EXISTS ${firstTable}`);
  const secondIndex = upSql.indexOf(`CREATE TABLE IF NOT EXISTS ${secondTable}`);

  assert.notEqual(firstIndex, -1, `${firstTable} table is not created`);
  assert.notEqual(secondIndex, -1, `${secondTable} table is not created`);
  assert.ok(firstIndex < secondIndex, `${firstTable} must be created before ${secondTable}`);
}

test("core schema migration is ordered before advanced forecasting migrations", () => {
  assert.ok(upFile < advancedInventoryMigration);
  assert.ok(downFile < advancedInventoryMigration);
});

test("core schema migration creates tables required by active backend code", () => {
  for (const tableName of ["pengguna", "kategori", "produk", "transaksi", "dataset_mingguan"]) {
    assert.match(upSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}`));
  }

  assertTableCreatedBefore("kategori", "produk");
  assertTableCreatedBefore("produk", "transaksi");
  assertTableCreatedBefore("produk", "dataset_mingguan");
});

test("core schema migration defines compatibility constraints and indexes", () => {
  assert.match(upSql, /username TEXT NOT NULL/);
  assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_pengguna_username_normalized/);
  assert.match(upSql, /kode_produk TEXT/);
  assert.match(upSql, /kategori_id INTEGER NOT NULL REFERENCES kategori\(id\) ON DELETE RESTRICT/);
  assert.match(upSql, /produk_id INTEGER NOT NULL REFERENCES produk\(id\) ON DELETE RESTRICT/);
  assert.match(upSql, /CHECK \(jenis_transaksi IN \('masuk', 'keluar'\)\)/);
  assert.match(upSql, /CHECK \(stok >= 0\)/);
  assert.match(upSql, /CHECK \(jumlah > 0\)/);
  assert.match(upSql, /UNIQUE \(produk_id, period_label\)/);
  assert.match(upSql, /ON dataset_mingguan \(produk_id, tahun, bulan, minggu_ke\)/);
});

test("core schema migration is safe to rerun for indexes and triggers", () => {
  assert.match(upSql, /CREATE TABLE IF NOT EXISTS produk/);
  assert.match(upSql, /CREATE INDEX IF NOT EXISTS idx_produk_kategori_id/);
  assert.match(upSql, /CREATE OR REPLACE FUNCTION set_core_updated_at_timestamp/);

  for (const triggerName of [
    "trg_pengguna_updated_at",
    "trg_kategori_updated_at",
    "trg_produk_updated_at",
    "trg_transaksi_updated_at",
    "trg_dataset_mingguan_updated_at",
  ]) {
    assert.match(upSql, new RegExp(`DROP TRIGGER IF EXISTS ${triggerName}`));
    assert.match(upSql, new RegExp(`CREATE TRIGGER ${triggerName}`));
  }
});

test("core schema rollback removes only core tables without cascading into advanced tables", () => {
  assert.match(downSql, /DROP TABLE IF EXISTS dataset_mingguan/);
  assert.match(downSql, /DROP TABLE IF EXISTS transaksi/);
  assert.match(downSql, /DROP TABLE IF EXISTS produk/);
  assert.match(downSql, /DROP TABLE IF EXISTS kategori/);
  assert.match(downSql, /DROP TABLE IF EXISTS pengguna/);
  assert.match(downSql, /DROP FUNCTION IF EXISTS set_core_updated_at_timestamp/);
  assert.doesNotMatch(downSql, /CASCADE/i);
});

test("core migration does not seed credentials or import monthly inventory data", () => {
  assert.doesNotMatch(upSql, /INSERT\s+INTO\s+pengguna/i);
  assert.doesNotMatch(upSql, /inventory_snapshot_monthly/i);
  assert.doesNotMatch(upSql, /product_alias/i);
  assert.doesNotMatch(upSql, /forecast_result/i);
  assert.doesNotMatch(upSql, /import_batch/i);
});
