const fs = require("node:fs");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyAllMigrations,
  createTestPool,
  migrationsDir,
  resetPublicSchema,
  rollbackLatestMigration,
} = require("./helpers");

const REQUIRED_TABLES = [
  "pengguna",
  "kategori",
  "produk",
  "transaksi",
  "dataset_mingguan",
  "inventory_snapshot_monthly",
  "product_alias",
  "forecast_run",
  "forecast_result",
  "forecast_backtest",
  "import_batch",
  "penjualan_bulanan",
  "product_mapping_issue",
  "schema_migrations",
];

test("database kosong dapat menjalankan seluruh migration, rerun, rollback, dan reapply", {
  timeout: 120000,
}, async () => {
  const pool = createTestPool();

  try {
    await resetPublicSchema(pool);
    const migrations = await applyAllMigrations(pool);
    assert.ok(migrations.length >= 7);

    const tableResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
    `);
    const tables = new Set(tableResult.rows.map((row) => row.table_name));
    for (const table of REQUIRED_TABLES) assert.equal(tables.has(table), true, table);

    const migrationCount = await pool.query(
      "SELECT COUNT(*)::INTEGER AS total FROM schema_migrations",
    );
    assert.equal(Number(migrationCount.rows[0].total), migrations.length);

    await applyAllMigrations(pool);
    const rerunCount = await pool.query(
      "SELECT COUNT(*)::INTEGER AS total FROM schema_migrations",
    );
    assert.equal(Number(rerunCount.rows[0].total), migrations.length);

    const constraints = await pool.query(`
      SELECT contype, COUNT(*)::INTEGER AS total
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public'
      GROUP BY contype
    `);
    const counts = new Map(constraints.rows.map((row) => [row.contype, Number(row.total)]));
    assert.ok((counts.get("f") || 0) >= 8, "foreign key");
    assert.ok((counts.get("c") || 0) >= 15, "check constraint");

    const latest = await rollbackLatestMigration(pool);
    assert.equal(latest, migrations.at(-1).name);
    const afterRollback = await pool.query(
      "SELECT COUNT(*)::INTEGER AS total FROM schema_migrations",
    );
    assert.equal(Number(afterRollback.rows[0].total), migrations.length - 1);

    await applyAllMigrations(pool);
    const restored = await pool.query(
      "SELECT COUNT(*)::INTEGER AS total FROM schema_migrations",
    );
    assert.equal(Number(restored.rows[0].total), migrations.length);

    for (const migration of migrations) {
      const downPath = `${migrationsDir}/${migration.name}.down.sql`;
      assert.equal(fs.existsSync(downPath), true, `down migration ${migration.name}`);
    }
  } finally {
    await pool.end();
  }
});
