const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const {
  buildImportPlan,
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
