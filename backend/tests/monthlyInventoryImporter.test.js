const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const {
  buildImportPlan,
  importMonthlyInventory,
  readMonthlyInventoryWorkbook,
} = require("../services/monthlyInventoryImporter");

function makeTestWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const headers = [["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"]];

  const januari = XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600ml", 0, 3000, 0],
    ["COFFEMIX   20 GR", 12, 1500, 18000],
  ]);
  const februari = XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600 ml", 5, 3000, 15000],
    ["Produk Tidak Ada", 7, 2500, 17500],
  ]);

  XLSX.utils.book_append_sheet(workbook, januari, "Januari 2024");
  XLSX.utils.book_append_sheet(workbook, februari, "Februari 2024");
  XLSX.writeFile(workbook, filePath);
}

function createImportDb() {
  const snapshots = new Map();
  const importBatches = [];
  const transactionQueries = [];

  return {
    snapshots,
    importBatches,
    transactionQueries,
    async query(sql) {
      if (sql.includes("FROM product_alias")) {
        return {
          rows: [
            { produk_id: 1, nama_normalisasi: "aqua botol 600 ml", nama_produk: "Aqua Botol 600 ml" },
            { produk_id: 2, nama_normalisasi: "coffemix 20 g", nama_produk: "Coffemix 20 g" },
          ],
        };
      }

      if (sql.includes("SELECT id, nama_produk FROM produk")) {
        return {
          rows: [
            { id: 1, nama_produk: "Aqua Botol 600 ml" },
            { id: 2, nama_produk: "Coffemix 20 g" },
          ],
        };
      }

      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          transactionQueries.push({ sql, params });

          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO import_batch")) {
            const id = importBatches.length + 1;
            importBatches.push({
              id,
              nama_file: params[0],
              jumlah_baris: params[1],
              jumlah_berhasil: params[2],
              jumlah_gagal: params[3],
              status: params[4],
            });
            return { rows: [{ id }] };
          }

          if (sql.includes("UPDATE import_batch")) {
            const batch = importBatches.find((item) => item.id === params[2]);
            if (batch) {
              batch.status = params[0];
              batch.detail_error = params[1];
            }
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO inventory_snapshot_monthly")) {
            const key = `${params[0]}|${params[1]}`;
            snapshots.set(key, {
              produk_id: params[0],
              periode: params[1],
              stok_akhir: params[2],
              harga_rata_rata: params[3],
              nilai_aset: params[4],
              nama_barang_sumber: params[5],
              sumber_file: params[6],
              status_data: params[7],
            });
            return { rows: [] };
          }

          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

test("monthly inventory workbook is parsed without weekly splitting", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-import-"));
  const filePath = path.join(tempDir, "history-mini.xlsx");
  makeTestWorkbook(filePath);

  const parsed = readMonthlyInventoryWorkbook(filePath, {
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });

  assert.equal(parsed.sheetCount, 2);
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual([...new Set(parsed.rows.map((row) => row.periode))], [
    "2024-01-01",
    "2024-02-01",
  ]);
});

test("buildImportPlan resolves aliases, keeps observed zero, and marks missing products", () => {
  const parsedWorkbook = {
    sourceFile: "history-mini.xlsx",
    sheetCount: 2,
    periods: ["2024-01-01", "2024-02-01"],
    rows: [
      {
        sheetName: "Januari 2024",
        rowNumber: 2,
        periode: "2024-01-01",
        nama_barang_sumber: "Aqua Botol 600ml",
        nama_normalisasi: "aqua botol 600 ml",
        stok_akhir: 0,
        harga_rata_rata: 3000,
        nilai_aset: 0,
      },
      {
        sheetName: "Januari 2024",
        rowNumber: 3,
        periode: "2024-01-01",
        nama_barang_sumber: "COFFEMIX   20 GR",
        nama_normalisasi: "coffemix 20 g",
        stok_akhir: 12,
        harga_rata_rata: 1500,
        nilai_aset: 18000,
      },
      {
        sheetName: "Februari 2024",
        rowNumber: 2,
        periode: "2024-02-01",
        nama_barang_sumber: "Aqua Botol 600 ml",
        nama_normalisasi: "aqua botol 600 ml",
        stok_akhir: 5,
        harga_rata_rata: 3000,
        nilai_aset: 15000,
      },
      {
        sheetName: "Februari 2024",
        rowNumber: 3,
        periode: "2024-02-01",
        nama_barang_sumber: "Produk Tidak Ada",
        nama_normalisasi: "produk tidak ada",
        stok_akhir: 7,
        harga_rata_rata: 2500,
        nilai_aset: 17500,
      },
    ],
  };

  const plan = buildImportPlan(
    parsedWorkbook,
    [
      { produk_id: 1, nama_normalisasi: "aqua botol 600 ml" },
      { produk_id: 2, nama_normalisasi: "coffemix 20 g" },
    ],
    [
      { id: 1, nama_produk: "Aqua Botol 600 ml" },
      { id: 2, nama_produk: "Coffemix 20 g" },
      { id: 3, nama_produk: "Produk Lain" },
    ],
  );

  const observedZero = plan.observedSnapshots.find(
    (snapshot) => snapshot.produk_id === 1 && snapshot.periode === "2024-01-01",
  );
  const missingCoffemixFebruary = plan.missingSnapshots.find(
    (snapshot) => snapshot.produk_id === 2 && snapshot.periode === "2024-02-01",
  );

  assert.equal(plan.summary.rows, 4);
  assert.equal(plan.summary.matchedProducts, 3);
  assert.equal(plan.summary.unresolvedProducts, 1);
  assert.equal(observedZero.status_data, "observed");
  assert.equal(observedZero.stok_akhir, 0);
  assert.equal(missingCoffemixFebruary.status_data, "missing");
  assert.equal(missingCoffemixFebruary.stok_akhir, null);
});

test("importMonthlyInventory is idempotent through upsert by product and period", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-import-"));
  const filePath = path.join(tempDir, "history-mini.xlsx");
  makeTestWorkbook(filePath);
  const db = createImportDb();

  const firstRun = await importMonthlyInventory(db, filePath, {
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });
  const secondRun = await importMonthlyInventory(db, filePath, {
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });

  assert.equal(firstRun.saved, true);
  assert.equal(secondRun.saved, true);
  assert.equal(db.importBatches.length, 2);
  assert.equal(db.snapshots.size, 4);
  assert.equal(db.snapshots.get("1|2024-01-01").stok_akhir, 0);
  assert.equal(db.snapshots.get("1|2024-02-01").stok_akhir, 5);
  assert.equal(db.snapshots.get("2|2024-01-01").stok_akhir, 12);
  assert.equal(db.snapshots.get("2|2024-02-01").status_data, "missing");
  assert.equal(
    db.transactionQueries.some(({ sql }) => sql.includes("ON CONFLICT (produk_id, periode)")),
    true,
  );
});

test("importMonthlyInventory dry-run validates workbook without writing snapshots or import_batch", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-import-"));
  const filePath = path.join(tempDir, "history-mini.xlsx");
  makeTestWorkbook(filePath);
  const db = createImportDb();

  const result = await importMonthlyInventory(db, filePath, {
    dryRun: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.saved, false);
  assert.equal(result.rows, 4);
  assert.equal(result.matchedProducts, 3);
  assert.equal(result.unresolvedProducts, 1);
  assert.equal(db.snapshots.size, 0);
  assert.equal(db.importBatches.length, 0);
  assert.equal(db.transactionQueries.length, 0);
});
