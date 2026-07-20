const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const { importMonthlyInventory } = require("../../services/monthlyInventoryImporter");
const {
  applyAllMigrations,
  createCategory,
  createProduct,
  createTestPool,
  resetPublicSchema,
} = require("./helpers");

function createWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const january = XLSX.utils.aoa_to_sheet([
    ["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"],
    ["Produk A 600ml", 0, 3000, 0],
    ["Produk B", 10, 2000, 20000],
  ]);
  const february = XLSX.utils.aoa_to_sheet([
    ["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"],
    ["Produk A 600 ml", 5, 3000, 15000],
  ]);
  XLSX.utils.book_append_sheet(workbook, january, "Januari 2024");
  XLSX.utils.book_append_sheet(workbook, february, "Februari 2024");
  XLSX.writeFile(workbook, filePath);
}

test("importer PostgreSQL menyimpan zero, missing status, dan tetap idempoten", {
  timeout: 120000,
}, async () => {
  const pool = createTestPool();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-db-import-"));
  const workbookPath = path.join(tempDir, "inventory.xlsx");
  createWorkbook(workbookPath);

  try {
    await resetPublicSchema(pool);
    await applyAllMigrations(pool);
    const categoryId = await createCategory(pool);
    const productA = await createProduct(pool, categoryId, {
      name: "Produk A 600 ml",
      code: "A-600",
    });
    const productB = await createProduct(pool, categoryId, {
      name: "Produk B",
      code: "B",
    });

    await pool.query(
      `
        INSERT INTO product_alias(produk_id, nama_alias, nama_normalisasi)
        VALUES
          ($1, 'Produk A 600 ml', 'produk a 600 ml'),
          ($2, 'Produk B', 'produk b')
      `,
      [productA, productB],
    );

    const options = { expectedPeriods: ["2024-01-01", "2024-02-01"] };
    const first = await importMonthlyInventory(pool, workbookPath, options);
    const second = await importMonthlyInventory(pool, workbookPath, options);
    assert.equal(first.saved, true);
    assert.equal(second.saved, true);

    const snapshots = await pool.query(`
      SELECT produk_id, periode::TEXT, stok_akhir, status_data
      FROM inventory_snapshot_monthly
      ORDER BY produk_id, periode
    `);
    assert.equal(snapshots.rows.length, 4);

    const januaryA = snapshots.rows.find(
      (row) => Number(row.produk_id) === productA && row.periode === "2024-01-01",
    );
    const februaryB = snapshots.rows.find(
      (row) => Number(row.produk_id) === productB && row.periode === "2024-02-01",
    );
    assert.equal(Number(januaryA.stok_akhir), 0);
    assert.equal(januaryA.status_data, "observed");
    assert.equal(februaryB.stok_akhir, null);
    assert.equal(februaryB.status_data, "not_listed");

    const batchCount = await pool.query(
      "SELECT COUNT(*)::INTEGER AS total FROM import_batch",
    );
    assert.equal(Number(batchCount.rows[0].total), 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    await pool.end();
  }
});
