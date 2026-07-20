const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildProductCatalogPlan,
  chooseCanonicalVariant,
  pickLatestValidRow,
} = require("../services/productCatalogBootstrapService");

function parsedWorkbook(rows) {
  return {
    sourceFile: "history.xlsx",
    sheetCount: 2,
    periods: ["2024-01-01", "2024-02-01"],
    rows,
  };
}

test("bootstrap plan groups name variants and prepares one product plus alias", () => {
  const rows = [
    {
      sheetName: "Januari 2024",
      rowNumber: 2,
      periode: "2024-01-01",
      nama_barang_sumber: "Aqua Botol 600ml",
      nama_normalisasi: "aqua botol 600 ml",
      stok_akhir: 10,
      harga_rata_rata: 3000,
    },
    {
      sheetName: "Februari 2024",
      rowNumber: 3,
      periode: "2024-02-01",
      nama_barang_sumber: "Aqua Botol 600 ml",
      nama_normalisasi: "aqua botol 600 ml",
      stok_akhir: 7,
      harga_rata_rata: 3200,
    },
  ];

  const plan = buildProductCatalogPlan(parsedWorkbook(rows));

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.collisions.length, 0);
  assert.equal(plan.candidates[0].nama_normalisasi, "aqua botol 600 ml");
  assert.equal(plan.candidates[0].latest_stock, 7);
  assert.equal(plan.candidates[0].latest_price, 3200);
  assert.equal(plan.candidates[0].active_from, "2024-01-01");
  assert.equal(plan.candidates[0].active_until, null);
  assert.deepEqual(plan.candidates[0].source_variants, [
    "Aqua Botol 600 ml",
    "Aqua Botol 600ml",
  ]);
});

test("bootstrap plan flags duplicate normalized product in the same month as collision", () => {
  const rows = [
    {
      sheetName: "Januari 2024",
      rowNumber: 2,
      periode: "2024-01-01",
      nama_barang_sumber: "Aqua 600ml",
      nama_normalisasi: "aqua 600 ml",
      stok_akhir: 10,
      harga_rata_rata: 3000,
    },
    {
      sheetName: "Januari 2024",
      rowNumber: 8,
      periode: "2024-01-01",
      nama_barang_sumber: "Aqua 600 ml",
      nama_normalisasi: "aqua 600 ml",
      stok_akhir: 20,
      harga_rata_rata: 3500,
    },
  ];

  const plan = buildProductCatalogPlan(parsedWorkbook(rows));

  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.collisions.length, 1);
  assert.ok(plan.collisions[0].reasons.includes("duplicate_product_in_same_period"));
});

test("bootstrap plan reuses an existing product and prepares a missing alias", () => {
  const rows = [{
    sheetName: "Januari 2024",
    rowNumber: 2,
    periode: "2024-01-01",
    nama_barang_sumber: "Coffemix 20 GR",
    nama_normalisasi: "coffemix 20 g",
    stok_akhir: 5,
    harga_rata_rata: 1500,
  }];

  const plan = buildProductCatalogPlan(parsedWorkbook(rows), {
    existingProducts: [{ id: 9, nama_produk: "Coffemix 20 g" }],
    existingAliases: [],
  });

  assert.equal(plan.candidates.length, 0);
  assert.equal(plan.existing.length, 1);
  assert.equal(plan.aliasesToCreate.length, 1);
  assert.equal(plan.aliasesToCreate[0].produk_id, 9);
});

test("bootstrap plan flags alias and direct product disagreement", () => {
  const rows = [{
    sheetName: "Januari 2024",
    rowNumber: 2,
    periode: "2024-01-01",
    nama_barang_sumber: "Produk A",
    nama_normalisasi: "produk a",
    stok_akhir: 1,
    harga_rata_rata: 1000,
  }];

  const plan = buildProductCatalogPlan(parsedWorkbook(rows), {
    existingProducts: [{ id: 1, nama_produk: "Produk A" }],
    existingAliases: [{ produk_id: 2, nama_alias: "Produk A", nama_normalisasi: "produk a" }],
  });

  assert.equal(plan.collisions.length, 1);
  assert.ok(plan.collisions[0].reasons.includes("existing_product_and_alias_disagree"));
});

test("canonical and latest value helpers are deterministic", () => {
  const rows = [
    { nama_barang_sumber: "Nama A", periode: "2024-01-01", rowNumber: 2, stok_akhir: 5 },
    { nama_barang_sumber: "Nama B", periode: "2024-02-01", rowNumber: 3, stok_akhir: 7 },
    { nama_barang_sumber: "Nama A", periode: "2024-03-01", rowNumber: 4, stok_akhir: null },
  ];

  assert.equal(chooseCanonicalVariant(rows), "Nama A");
  assert.equal(pickLatestValidRow(rows).stok_akhir, 7);
});

test("bootstrap plan maps source categories from workbook sections", () => {
  const rows = [
    {
      sheetName: "Jan 24",
      rowNumber: 12,
      periode: "2024-01-01",
      nama_barang_sumber: "Pulpen Hitam",
      nama_normalisasi: "pulpen hitam",
      kategori_sumber: "ATK",
      stok_akhir: 10,
      harga_rata_rata: 2500,
    },
  ];

  const plan = buildProductCatalogPlan(parsedWorkbook(rows));
  assert.equal(plan.candidates[0].category_name, "ATK");
  assert.deepEqual(plan.candidates[0].source_categories, ["ATK"]);
});
