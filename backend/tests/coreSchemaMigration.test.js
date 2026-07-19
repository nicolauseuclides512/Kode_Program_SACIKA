const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const migrationsDir = path.join(__dirname, "../migrations");
const upFile = "202607170001_create_core_schema.up.sql";
const downFile = "202607170001_create_core_schema.down.sql";
const advancedInventoryMigration = "202607180001_add_inventory_history_forecast.up.sql";

const upSql = fs.readFileSync(path.join(migrationsDir, upFile), "utf8");
const downSql = fs.readFileSync(path.join(migrationsDir, downFile), "utf8");
const authControllerSource = fs.readFileSync(path.join(__dirname, "../controllers/authController.js"), "utf8");
const produkControllerSource = fs.readFileSync(path.join(__dirname, "../controllers/produkController.js"), "utf8");
const transaksiControllerSource = fs.readFileSync(path.join(__dirname, "../controllers/transaksiController.js"), "utf8");
const salesAggregationSource = fs.readFileSync(path.join(__dirname, "../services/salesAggregationService.js"), "utf8");

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

test("core schema migration defines secure auth columns without plaintext password storage", () => {
  assert.match(upSql, /id BIGSERIAL PRIMARY KEY/);
  assert.match(upSql, /username TEXT NOT NULL/);
  assert.match(upSql, /password_hash TEXT NOT NULL/);
  assert.match(upSql, /is_active BOOLEAN NOT NULL DEFAULT TRUE/);
  assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_pengguna_username_normalized/);
  assert.match(upSql, /LOWER\(BTRIM\(username\)\)/);
  assert.doesNotMatch(upSql, /\bpassword TEXT\b/);
  assert.match(authControllerSource, /FROM pengguna/);
});

test("core schema migration defines product, category, and transaction columns used by backend queries", () => {
  assert.match(upSql, /CREATE TABLE IF NOT EXISTS kategori/);
  assert.match(upSql, /nama_kategori TEXT NOT NULL/);
  assert.match(upSql, /kode_produk TEXT/);
  assert.match(upSql, /nama_produk TEXT NOT NULL/);
  assert.match(upSql, /kategori_id BIGINT NOT NULL REFERENCES kategori\(id\) ON DELETE RESTRICT/);
  assert.match(upSql, /harga NUMERIC\(14, 2\) NOT NULL DEFAULT 0/);
  assert.match(upSql, /stok NUMERIC\(14, 2\) NOT NULL DEFAULT 0/);
  assert.match(upSql, /stok_minimum NUMERIC\(14, 2\) NOT NULL DEFAULT 5/);
  assert.match(upSql, /produk_id BIGINT NOT NULL REFERENCES produk\(id\) ON DELETE RESTRICT/);
  assert.match(upSql, /jumlah NUMERIC\(14, 2\) NOT NULL/);
  assert.match(upSql, /total NUMERIC\(18, 2\) NOT NULL/);
  assert.match(upSql, /tanggal DATE NOT NULL DEFAULT CURRENT_DATE/);
  assert.match(produkControllerSource, /nama_produk/);
  assert.match(produkControllerSource, /kategori_id/);
  assert.match(produkControllerSource, /stok_minimum/);
  assert.match(transaksiControllerSource, /jenis_transaksi/);
});

test("core schema migration defines compatibility constraints and indexes", () => {
  assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_kategori_nama_normalized/);
  assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_nama_normalized/);
  assert.match(upSql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_kode_normalized/);
  assert.match(upSql, /CHECK \(jenis_transaksi IN \('masuk', 'keluar'\)\)/);
  assert.match(upSql, /CHECK \(stok >= 0\)/);
  assert.match(upSql, /CHECK \(jumlah > 0\)/);
  assert.match(upSql, /CHECK \(harga >= 0\)/);
  assert.match(upSql, /CHECK \(total >= 0\)/);
  assert.match(upSql, /UNIQUE \(produk_id, period_label\)/);
  assert.match(upSql, /ON dataset_mingguan \(produk_id, tahun, bulan, minggu_ke\)/);
  assert.match(upSql, /CREATE INDEX IF NOT EXISTS idx_transaksi_produk_id/);
  assert.match(upSql, /CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal/);
  assert.match(upSql, /CREATE INDEX IF NOT EXISTS idx_transaksi_jenis_tanggal/);
});

test("dataset_mingguan remains a restricted compatibility table for recorded sales aggregation", () => {
  assert.match(upSql, /CREATE TABLE IF NOT EXISTS dataset_mingguan/);
  assert.match(upSql, /produk_id BIGINT NOT NULL REFERENCES produk\(id\) ON DELETE RESTRICT/);
  assert.match(upSql, /tahun INTEGER NOT NULL/);
  assert.match(upSql, /bulan INTEGER NOT NULL/);
  assert.match(upSql, /minggu_ke INTEGER NOT NULL/);
  assert.match(upSql, /period_label TEXT NOT NULL/);
  assert.match(upSql, /total_penjualan NUMERIC\(14, 2\) NOT NULL DEFAULT 0/);
  assert.match(upSql, /CHECK \(bulan BETWEEN 1 AND 12\)/);
  assert.match(upSql, /CHECK \(minggu_ke BETWEEN 1 AND 4\)/);
  assert.match(upSql, /CHECK \(total_penjualan >= 0\)/);
  assert.match(upSql, /Not a source for monthly ending inventory forecasts/);
  assert.match(salesAggregationSource, /INSERT INTO dataset_mingguan/);
});

test("core schema migration is safe to rerun for indexes and triggers", () => {
  assert.match(upSql, /CREATE TABLE IF NOT EXISTS produk/);
  assert.match(upSql, /CREATE INDEX IF NOT EXISTS idx_produk_kategori_id/);
  assert.match(upSql, /CREATE OR REPLACE FUNCTION set_core_schema_updated_at/);
  assert.doesNotMatch(upSql, /set_updated_at_timestamp/);

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

test("core schema rollback removes only core tables in dependency order", () => {
  assert.ok(downSql.indexOf("DROP TABLE IF EXISTS dataset_mingguan") < downSql.indexOf("DROP TABLE IF EXISTS transaksi"));
  assert.ok(downSql.indexOf("DROP TABLE IF EXISTS transaksi") < downSql.indexOf("DROP TABLE IF EXISTS produk"));
  assert.ok(downSql.indexOf("DROP TABLE IF EXISTS produk") < downSql.indexOf("DROP TABLE IF EXISTS kategori"));
  assert.ok(downSql.indexOf("DROP TABLE IF EXISTS kategori") < downSql.indexOf("DROP TABLE IF EXISTS pengguna"));
  assert.match(downSql, /DROP FUNCTION IF EXISTS set_core_schema_updated_at/);
  assert.doesNotMatch(downSql, /CASCADE/i);
});

test("core migration does not seed credentials or import monthly inventory data", () => {
  assert.doesNotMatch(upSql, /INSERT\s+INTO\s+pengguna/i);
  assert.doesNotMatch(upSql, /inventory_snapshot_monthly/i);
  assert.doesNotMatch(upSql, /product_alias/i);
  assert.doesNotMatch(upSql, /forecast_result/i);
  assert.doesNotMatch(upSql, /import_batch/i);
});
