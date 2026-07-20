const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createStockTransaction,
  StockTransactionError,
} = require("../../services/stockTransactionService");
const {
  applyAllMigrations,
  createCategory,
  createProduct,
  createTestPool,
  resetPublicSchema,
} = require("./helpers");

async function readProductState(pool, productId) {
  const [product, transactions, weekly, monthly] = await Promise.all([
    pool.query("SELECT stok FROM produk WHERE id=$1", [productId]),
    pool.query(
      "SELECT jenis_transaksi, jumlah FROM transaksi WHERE produk_id=$1 ORDER BY id",
      [productId],
    ),
    pool.query(
      "SELECT total_penjualan FROM dataset_mingguan WHERE produk_id=$1",
      [productId],
    ),
    pool.query(
      "SELECT total_penjualan FROM penjualan_bulanan WHERE produk_id=$1",
      [productId],
    ),
  ]);

  return {
    stock: Number(product.rows[0].stok),
    transactions: transactions.rows.map((row) => ({
      type: row.jenis_transaksi,
      amount: Number(row.jumlah),
    })),
    weeklySales: weekly.rows.map((row) => Number(row.total_penjualan)),
    monthlySales: monthly.rows.map((row) => Number(row.total_penjualan)),
  };
}

test("dua transaksi keluar bersamaan tidak dapat membuat stok negatif", {
  timeout: 120000,
}, async () => {
  const pool = createTestPool();

  try {
    await resetPublicSchema(pool);
    await applyAllMigrations(pool);
    const categoryId = await createCategory(pool, "Kategori Concurrency");
    const productId = await createProduct(pool, categoryId, {
      name: "Produk Concurrency Keluar",
      stock: 10,
      price: 1000,
    });

    const input = {
      produk_id: productId,
      jenis_transaksi: "keluar",
      jumlah: 7,
      harga: 1000,
      tanggal: "2026-07-10",
    };

    const results = await Promise.allSettled([
      createStockTransaction(pool, input),
      createStockTransaction(pool, input),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].reason instanceof StockTransactionError, true);
    assert.equal(rejected[0].reason.statusCode, 400);
    assert.match(rejected[0].reason.message, /stok tidak mencukupi/i);

    const state = await readProductState(pool, productId);
    assert.equal(state.stock, 3);
    assert.deepEqual(state.transactions, [{ type: "keluar", amount: 7 }]);
    assert.deepEqual(state.weeklySales, [7]);
    assert.deepEqual(state.monthlySales, [7]);
  } finally {
    await pool.end();
  }
});

test("dua transaksi masuk bersamaan sama-sama tersimpan tanpa lost update", {
  timeout: 120000,
}, async () => {
  const pool = createTestPool();

  try {
    await resetPublicSchema(pool);
    await applyAllMigrations(pool);
    const categoryId = await createCategory(pool, "Kategori Incoming Concurrency");
    const productId = await createProduct(pool, categoryId, {
      name: "Produk Concurrency Masuk",
      stock: 10,
      price: 1000,
    });

    const results = await Promise.allSettled([
      createStockTransaction(pool, {
        produk_id: productId,
        jenis_transaksi: "masuk",
        jumlah: 5,
        harga: 1000,
        tanggal: "2026-07-10",
      }),
      createStockTransaction(pool, {
        produk_id: productId,
        jenis_transaksi: "masuk",
        jumlah: 8,
        harga: 1000,
        tanggal: "2026-07-10",
      }),
    ]);

    assert.equal(results.every((result) => result.status === "fulfilled"), true);

    const state = await readProductState(pool, productId);
    assert.equal(state.stock, 23);
    assert.equal(state.transactions.length, 2);
    assert.deepEqual(
      state.transactions.map((item) => item.amount).sort((a, b) => a - b),
      [5, 8],
    );
    assert.deepEqual(state.weeklySales, []);
    assert.deepEqual(state.monthlySales, []);
  } finally {
    await pool.end();
  }
});
