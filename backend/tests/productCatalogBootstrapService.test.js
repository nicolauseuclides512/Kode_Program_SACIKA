const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const XLSX = require("xlsx");

const {
  bootstrapProductsFromWorkbook,
  buildProductCatalogPlan,
  DEFAULT_CATEGORY_NAME,
} = require("../services/productCatalogBootstrapService");
const {
  readMonthlyInventoryWorkbook,
} = require("../services/monthlyInventoryImporter");

function makeBootstrapWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const headers = [["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"]];

  const januari = XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600ml", 1, 3000, 3000],
    ["COFFEMIX   20 GR", 12, 1500, 18000],
    ["ABC-A 100ml", 8, 1000, 8000],
    ["Produk Rusak", null, 5000, 0],
  ]);
  const februari = XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600 ml", 5, 3500, 17500],
    ["Coffemix 20 g", 9, 1600, 14400],
    ["ABC A 100 ml", 10, 1100, 11000],
  ]);

  XLSX.utils.book_append_sheet(workbook, januari, "Januari 2024");
  XLSX.utils.book_append_sheet(workbook, februari, "Februari 2024");
  XLSX.writeFile(workbook, filePath);
}

function makeDuplicateWorkbook(filePath) {
  const workbook = XLSX.utils.book_new();
  const headers = [["Nama Barang", "Jml", "Harga Rata-rata", "Nilai Aset"]];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600ml", 1, 3000, 3000],
  ]), "Januari 2024");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ...headers,
    ["Aqua Botol 600 ml", 5, 3500, 17500],
  ]), "Februari 2024");
  XLSX.writeFile(workbook, filePath);
}

function createBootstrapDb() {
  const state = {
    categories: new Map([
      ["belum dikategorikan", { id: 99, nama_kategori: DEFAULT_CATEGORY_NAME }],
      ["minuman", { id: 1, nama_kategori: "Minuman" }],
    ]),
    products: [],
    aliases: [],
    transactionQueries: [],
    nextProductId: 1,
    nextAliasId: 1,
  };

  function normalize(value) {
    return String(value || "").trim().toLowerCase();
  }

  const db = {
    state,
    async query(sql) {
      state.transactionQueries.push({ scope: "pool", sql, params: [] });

      if (sql.includes("FROM kategori")) {
        return { rows: [...state.categories.values()] };
      }

      if (sql.includes("FROM produk")) {
        return { rows: state.products.map((product) => ({ id: product.id, nama_produk: product.nama_produk })) };
      }

      if (sql.includes("FROM product_alias")) {
        return { rows: state.aliases.map((alias) => ({ ...alias })) };
      }

      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          state.transactionQueries.push({ scope: "client", sql, params });

          if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) {
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO produk")) {
            const existing = state.products.find((product) => normalize(product.nama_produk) === normalize(params[0]));
            if (existing) return { rows: [{ id: existing.id, nama_produk: existing.nama_produk }] };

            const product = {
              id: state.nextProductId,
              nama_produk: params[0],
              kategori_id: params[1],
              harga: params[2],
              stok: params[3],
              stok_minimum: params[4],
            };
            state.nextProductId += 1;
            state.products.push(product);
            return { rows: [{ id: product.id, nama_produk: product.nama_produk }] };
          }

          if (sql.includes("INSERT INTO product_alias")) {
            const existing = state.aliases.find((alias) => alias.nama_normalisasi === params[2]);
            if (existing) return { rows: [] };

            const alias = {
              id: state.nextAliasId,
              produk_id: params[0],
              nama_alias: params[1],
              nama_normalisasi: params[2],
            };
            state.nextAliasId += 1;
            state.aliases.push(alias);
            return { rows: [alias] };
          }

          return { rows: [] };
        },
        release() {},
      };
    },
  };

  return db;
}

test("buildProductCatalogPlan groups name variations and uses latest stock and price", () => {
  const parsedWorkbook = {
    sourceFile: "mini.xlsx",
    sheetCount: 2,
    rows: [
      {
        sheetName: "Januari 2024",
        rowNumber: 2,
        periode: "2024-01-01",
        nama_barang_sumber: "Aqua Botol 600ml",
        stok_akhir: 1,
        harga_rata_rata: 3000,
      },
      {
        sheetName: "Februari 2024",
        rowNumber: 2,
        periode: "2024-02-01",
        nama_barang_sumber: "Aqua Botol 600 ml",
        stok_akhir: 5,
        harga_rata_rata: 3500,
      },
    ],
  };

  const plan = buildProductCatalogPlan(parsedWorkbook, {
    categoryRows: [{ id: 99, nama_kategori: DEFAULT_CATEGORY_NAME }],
    productRows: [],
    aliasRows: [],
  });

  assert.equal(plan.summary.unique_normalized_products, 1);
  assert.equal(plan.products_to_create.length, 1);
  assert.equal(plan.products_to_create[0].nama_normalisasi, "aqua botol 600 ml");
  assert.equal(plan.products_to_create[0].stok, 5);
  assert.equal(plan.products_to_create[0].harga, 3500);
  assert.deepEqual(plan.products_to_create[0].source_names, ["Aqua Botol 600 ml", "Aqua Botol 600ml"]);
});

test("buildProductCatalogPlan sends possible merged products to collision-review", () => {
  const parsedWorkbook = {
    sourceFile: "mini.xlsx",
    sheetCount: 2,
    rows: [
      {
        sheetName: "Januari 2024",
        rowNumber: 2,
        periode: "2024-01-01",
        nama_barang_sumber: "ABC-A 100ml",
        stok_akhir: 8,
        harga_rata_rata: 1000,
      },
      {
        sheetName: "Februari 2024",
        rowNumber: 2,
        periode: "2024-02-01",
        nama_barang_sumber: "ABC A 100 ml",
        stok_akhir: 10,
        harga_rata_rata: 1100,
      },
    ],
  };

  const plan = buildProductCatalogPlan(parsedWorkbook, {
    categoryRows: [{ id: 99, nama_kategori: DEFAULT_CATEGORY_NAME }],
    productRows: [],
    aliasRows: [],
  });

  assert.equal(plan.collision_review.length, 1);
  assert.equal(plan.products_to_create.length, 0);
  assert.equal(plan.aliases_to_create.length, 0);
});

test("bootstrap dry-run reads workbook without weekly splitting and does not write database", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-bootstrap-"));
  const filePath = path.join(tempDir, "bootstrap-mini.xlsx");
  const reportPath = path.join(tempDir, "report.json");
  makeBootstrapWorkbook(filePath);
  const db = createBootstrapDb();

  const result = await bootstrapProductsFromWorkbook(db, filePath, {
    dryRun: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
    reportOutputPath: reportPath,
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(result.saved, false);
  assert.equal(result.summary.products_to_create, 2);
  assert.equal(result.summary.collisions, 1);
  assert.equal(result.summary.invalid_rows, 1);
  assert.equal(db.state.products.length, 0);
  assert.equal(db.state.aliases.length, 0);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("INSERT INTO produk")), false);
  assert.equal(fs.existsSync(reportPath), true);

  const parsed = readMonthlyInventoryWorkbook(filePath, {
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });
  assert.deepEqual([...new Set(parsed.rows.map((row) => row.periode))], ["2024-01-01", "2024-02-01"]);
});

test("bootstrap commit creates products and product_alias rows only", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-bootstrap-"));
  const filePath = path.join(tempDir, "bootstrap-mini.xlsx");
  makeDuplicateWorkbook(filePath);
  const db = createBootstrapDb();

  const result = await bootstrapProductsFromWorkbook(db, filePath, {
    commit: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });

  assert.equal(result.mode, "commit");
  assert.equal(result.saved, true);
  assert.equal(db.state.products.length, 1);
  assert.equal(db.state.aliases.length, 1);
  assert.equal(db.state.products[0].nama_produk, "Aqua Botol 600 ml");
  assert.equal(db.state.products[0].stok, 5);
  assert.equal(db.state.products[0].harga, 3500);
  assert.equal(db.state.aliases[0].nama_normalisasi, "aqua botol 600 ml");
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("inventory_snapshot_monthly")), false);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("INSERT INTO transaksi")), false);
});

test("bootstrap commit is idempotent across repeated runs", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-bootstrap-"));
  const filePath = path.join(tempDir, "bootstrap-mini.xlsx");
  makeDuplicateWorkbook(filePath);
  const db = createBootstrapDb();

  const first = await bootstrapProductsFromWorkbook(db, filePath, {
    commit: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });
  const second = await bootstrapProductsFromWorkbook(db, filePath, {
    commit: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
  });

  assert.equal(first.created_products.length, 1);
  assert.equal(second.created_products.length, 0);
  assert.equal(db.state.products.length, 1);
  assert.equal(db.state.aliases.length, 1);
  assert.equal(second.summary.existing_products, 1);
});

test("bootstrap supports optional category map JSON", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sacika-bootstrap-"));
  const filePath = path.join(tempDir, "bootstrap-mini.xlsx");
  const categoryMapPath = path.join(tempDir, "category-map.json");
  makeDuplicateWorkbook(filePath);
  fs.writeFileSync(categoryMapPath, JSON.stringify({ "aqua botol 600 ml": "Minuman" }));
  const db = createBootstrapDb();

  await bootstrapProductsFromWorkbook(db, filePath, {
    commit: true,
    expectedPeriods: ["2024-01-01", "2024-02-01"],
    categoryMapPath,
  });

  assert.equal(db.state.products[0].kategori_id, 1);
});
