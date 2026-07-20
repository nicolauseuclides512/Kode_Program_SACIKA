const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const {
  readMigrationFiles,
  runPendingMigrations,
} = require("../../scripts/migrationRunner");
const {
  runSeed,
} = require("../../scripts/seed");
const {
  bootstrapProductsFromWorkbook,
} = require("../../services/productCatalogBootstrapService");
const {
  importMonthlyInventory,
} = require("../../services/monthlyInventoryImporter");
const {
  getInventoryHistory,
  getProductQuality,
} = require("../../services/inventoryHistoryQualityService");
const {
  runInventoryForecast,
} = require("../../services/inventoryForecastService");
const {
  createStockTransaction,
} = require("../../services/stockTransactionService");
const {
  runSalesAggregation,
} = require("../../services/salesAggregationService");
const {
  runDatabaseHealthCheck,
} = require("../../services/databaseHealthService");

dotenv.config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true });

const isDatabaseTestRun = process.env.npm_lifecycle_event === "test:db";

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function requireTestDatabaseUrl() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL wajib diatur untuk menjalankan npm run test:db");
  }

  if (process.env.DATABASE_URL && testDatabaseUrl === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL tidak boleh sama dengan DATABASE_URL development");
  }

  return testDatabaseUrl;
}

async function resetPublicSchema(pool) {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

function createMonthlyWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  let monthIndex = 0;

  for (const year of [2024, 2025]) {
    for (const monthName of MONTH_NAMES) {
      const stock = 20 + monthIndex;
      const price = 2500 + monthIndex;
      const sheet = XLSX.utils.aoa_to_sheet([
        ["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"],
        ["Smoke Aqua 600ml", stock, price, stock * price],
      ]);

      XLSX.utils.book_append_sheet(workbook, sheet, `${monthName} ${year}`);
      monthIndex += 1;
    }
  }

  XLSX.writeFile(workbook, filePath);
}

async function createCategoryCrudRecord(pool) {
  const createResult = await pool.query(
    "INSERT INTO kategori (nama_kategori) VALUES ($1) RETURNING id, nama_kategori",
    ["Smoke CRUD"],
  );
  const categoryId = createResult.rows[0].id;

  const readResult = await pool.query(
    "SELECT id, nama_kategori FROM kategori WHERE id=$1",
    [categoryId],
  );
  assert.equal(readResult.rows[0].nama_kategori, "Smoke CRUD");

  await pool.query(
    "UPDATE kategori SET nama_kategori=$1 WHERE id=$2",
    ["Smoke CRUD Updated", categoryId],
  );
  const updatedResult = await pool.query(
    "SELECT nama_kategori FROM kategori WHERE id=$1",
    [categoryId],
  );
  assert.equal(updatedResult.rows[0].nama_kategori, "Smoke CRUD Updated");

  await assert.rejects(
    () => pool.query(
      "INSERT INTO kategori (nama_kategori) VALUES ($1)",
      [" smoke crud updated "],
    ),
    (error) => error.code === "23505",
  );

  await pool.query("DELETE FROM kategori WHERE id=$1", [categoryId]);
  const deletedResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM kategori WHERE id=$1",
    [categoryId],
  );
  assert.equal(Number(deletedResult.rows[0].count), 0);
}

async function createProduct(pool, categoryId) {
  const result = await pool.query(
    `
      INSERT INTO produk (nama_produk, kategori_id, harga, stok, stok_minimum)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, stok
    `,
    ["Smoke Transaction Product", categoryId, 1000, 0, 5],
  );

  return result.rows[0];
}

async function assertAdminLogin(pool, username, password) {
  const result = await pool.query(
    `
      SELECT id, nama, username, password_hash, is_active
      FROM pengguna
      WHERE LOWER(BTRIM(username)) = LOWER(BTRIM($1))
      LIMIT 1
    `,
    [username],
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].is_active, true);
  assert.notEqual(result.rows[0].password_hash, password);
  assert.equal(await bcrypt.compare(password, result.rows[0].password_hash), true);
}

async function assertRollbackFromRejectedOutgoingTransaction(pool, productId) {
  const before = await pool.query(
    `
      SELECT p.stok, COUNT(t.id)::int AS transaksi_count
      FROM produk p
      LEFT JOIN transaksi t ON t.produk_id = p.id
      WHERE p.id=$1
      GROUP BY p.id
    `,
    [productId],
  );

  await assert.rejects(
    () => createStockTransaction(pool, {
      produk_id: productId,
      jenis_transaksi: "keluar",
      jumlah: 999,
      harga: 1000,
      tanggal: "2026-01-03",
    }),
    /Stok tidak mencukupi/,
  );

  const after = await pool.query(
    `
      SELECT p.stok, COUNT(t.id)::int AS transaksi_count
      FROM produk p
      LEFT JOIN transaksi t ON t.produk_id = p.id
      WHERE p.id=$1
      GROUP BY p.id
    `,
    [productId],
  );

  assert.equal(Number(after.rows[0].stok), Number(before.rows[0].stok));
  assert.equal(Number(after.rows[0].transaksi_count), Number(before.rows[0].transaksi_count));
}

async function getProductIdByName(pool, name) {
  const result = await pool.query(
    "SELECT id FROM produk WHERE nama_produk=$1",
    [name],
  );

  assert.equal(result.rows.length, 1);
  return Number(result.rows[0].id);
}

async function countTable(pool, tableName) {
  const allowedTables = new Set([
    "inventory_snapshot_monthly",
    "forecast_result",
    "import_batch",
  ]);

  if (!allowedTables.has(tableName)) {
    throw new Error(`Tabel tidak diizinkan untuk countTable: ${tableName}`);
  }

  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0].count);
}

test("database smoke integration", { skip: isDatabaseTestRun ? false : "Jalankan dengan npm run test:db" }, async () => {
  const testDatabaseUrl = requireTestDatabaseUrl();
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-db-smoke-"));
  const workbookPath = path.join(tempDir, "smoke-inventory.xlsx");
  const adminPassword = "SmokeAdminPassword-2026!";
  const adminEnv = {
    ADMIN_NAME: "Smoke Administrator",
    ADMIN_USERNAME: "smoke_admin",
    ADMIN_PASSWORD: adminPassword,
  };

  try {
    await resetPublicSchema(pool);

    const localMigrations = readMigrationFiles(undefined, "up");
    const migrationResult = await runPendingMigrations({
      pool,
      logger: { info() {} },
    });
    assert.deepEqual(migrationResult.applied, localMigrations.map((migration) => migration.migrationName));

    const appliedResult = await pool.query(
      "SELECT migration_name FROM schema_migrations ORDER BY id ASC",
    );
    assert.deepEqual(
      appliedResult.rows.map((row) => row.migration_name),
      localMigrations.map((migration) => migration.migrationName),
    );

    await runSeed({ pool, env: adminEnv, logger: { info() {} } });
    await runSeed({ pool, env: adminEnv, logger: { info() {} } });

    const categoryCountResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM kategori",
    );
    assert.equal(Number(categoryCountResult.rows[0].count), 5);

    await assertAdminLogin(pool, adminEnv.ADMIN_USERNAME, adminPassword);
    await createCategoryCrudRecord(pool);

    const productCategoryResult = await pool.query(
      "SELECT id FROM kategori WHERE nama_kategori=$1",
      ["Minuman"],
    );
    const transactionProduct = await createProduct(pool, productCategoryResult.rows[0].id);
    assert.equal(Number(transactionProduct.stok), 0);

    const incoming = await createStockTransaction(pool, {
      produk_id: transactionProduct.id,
      jenis_transaksi: "masuk",
      jumlah: 10,
      harga: 1000,
      tanggal: "2026-01-01",
    });
    assert.equal(incoming.stok_sekarang, 10);

    const outgoing = await createStockTransaction(pool, {
      produk_id: transactionProduct.id,
      jenis_transaksi: "keluar",
      jumlah: 4,
      harga: 1000,
      tanggal: "2026-01-02",
    });
    assert.equal(outgoing.stok_sekarang, 6);

    await assertRollbackFromRejectedOutgoingTransaction(pool, transactionProduct.id);

    await assert.rejects(
      () => pool.query("DELETE FROM kategori WHERE id=$1", [productCategoryResult.rows[0].id]),
      (error) => error.code === "23503",
    );

    createMonthlyWorkbook(workbookPath);
    const bootstrapResult = await bootstrapProductsFromWorkbook(pool, workbookPath, {
      commit: true,
      reportOutputPath: path.join(tempDir, "bootstrap-report.json"),
    });
    assert.equal(bootstrapResult.created_products.length, 1);
    assert.equal(bootstrapResult.created_aliases.length, 1);

    const inventoryProductId = await getProductIdByName(pool, "Smoke Aqua 600ml");
    const firstImport = await importMonthlyInventory(pool, workbookPath, {
      unresolvedOutputPath: path.join(tempDir, "unresolved-first.json"),
    });
    assert.equal(firstImport.saved, true);
    assert.equal(firstImport.periodsVerified, 24);

    const snapshotCountAfterFirstImport = await countTable(pool, "inventory_snapshot_monthly");
    const secondImport = await importMonthlyInventory(pool, workbookPath, {
      unresolvedOutputPath: path.join(tempDir, "unresolved-second.json"),
    });
    assert.equal(secondImport.saved, true);
    assert.equal(await countTable(pool, "inventory_snapshot_monthly"), snapshotCountAfterFirstImport);

    const history = await getInventoryHistory(pool, inventoryProductId);
    assert.equal(history.status, "ok");
    assert.equal(history.data.observation_count, 24);
    assert.equal(history.data.periods[0], "2024-01");
    assert.equal(history.data.periods[23], "2025-12");

    const quality = await getProductQuality(pool, inventoryProductId);
    assert.equal(quality.status, "eligible");
    assert.equal(quality.observation_count, 24);

    const forecast = await runInventoryForecast(pool, inventoryProductId, {
      horizon: 1,
      httpClient: {
        async post(url, payload) {
          assert.match(url, /\/predict$/);
          assert.equal(payload.product_id, inventoryProductId);
          assert.equal(payload.target, "ending_inventory");
          assert.equal(payload.frequency, "monthly");
          assert.equal(payload.periods.length, 24);

          return {
            data: {
              product_id: inventoryProductId,
              target: "ending_inventory",
              frequency: "monthly",
              model_used: "SES",
              forecast_periods: ["2026-01"],
              forecast_values: [44],
              evaluation: {
                mae: 1,
                rmse: 1.2,
                wape: 3.4,
                test_points: 6,
              },
              candidate_models: [
                { model: "SES", status: "success", mae: 1 },
              ],
              backtest: [],
              warning: null,
            },
          };
        },
      },
    });
    assert.equal(forecast.model_used, "SES");
    assert.equal(await countTable(pool, "forecast_result"), 1);

    await runSalesAggregation(pool);
    await runSalesAggregation(pool);
    const salesResult = await pool.query(
      `
        SELECT total_penjualan
        FROM penjualan_bulanan
        WHERE produk_id=$1 AND periode=$2
      `,
      [transactionProduct.id, "2026-01-01"],
    );
    assert.equal(salesResult.rows.length, 1);
    assert.equal(Number(salesResult.rows[0].total_penjualan), 4);

    const healthReport = await runDatabaseHealthCheck(pool, {
      env: {
        ADMIN_USERNAME: adminEnv.ADMIN_USERNAME,
      },
    });
    assert.equal(healthReport.exit_code, 0);
  } finally {
    await pool.end();
  }
});

