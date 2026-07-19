const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCurrentStockSyncReport,
  syncCurrentStockFromSnapshots,
} = require("../services/currentStockSyncService");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSyncDb({ products = [], snapshots = [], failUpdateProductId = null } = {}) {
  const state = {
    products: clone(products),
    snapshots: clone(snapshots),
    transactionQueries: [],
  };

  return {
    state,
    async connect() {
      let workingProducts = clone(state.products);

      return {
        async query(sql, params = []) {
          state.transactionQueries.push({ sql, params });
          const normalizedSql = sql.trim();

          if (normalizedSql === "BEGIN") {
            workingProducts = clone(state.products);
            return { rows: [], rowCount: 0 };
          }

          if (normalizedSql === "COMMIT") {
            state.products = clone(workingProducts);
            return { rows: [], rowCount: 0 };
          }

          if (normalizedSql === "ROLLBACK") {
            workingProducts = clone(state.products);
            return { rows: [], rowCount: 0 };
          }

          if (sql.includes("SELECT id, nama_produk, stok") && sql.includes("FROM produk")) {
            return {
              rows: workingProducts.map((product) => ({
                id: product.id,
                nama_produk: product.nama_produk,
                stok: product.stok,
              })),
              rowCount: workingProducts.length,
            };
          }

          if (sql.includes("FROM inventory_snapshot_monthly")) {
            return {
              rows: clone(state.snapshots),
              rowCount: state.snapshots.length,
            };
          }

          if (sql.includes("UPDATE produk") && sql.includes("SET stok")) {
            const [newStock, productId] = params;

            if (failUpdateProductId === productId) {
              throw new Error("simulated update failure");
            }

            const product = workingProducts.find((item) => item.id === productId);
            if (!product) return { rows: [], rowCount: 0 };

            product.stok = newStock;
            return { rows: [{ id: productId }], rowCount: 1 };
          }

          throw new Error(`Unexpected query: ${sql}`);
        },
        release() {},
      };
    },
  };
}

test("buildCurrentStockSyncReport memilih snapshot valid terbaru dan mengabaikan missing", () => {
  const report = buildCurrentStockSyncReport(
    [{ id: 1, nama_produk: "Aqua Botol 600 ml", stok: 7 }],
    [
      {
        id: 1,
        produk_id: 1,
        periode: "2025-01-01",
        stok_akhir: 10,
        status_data: "observed",
      },
      {
        id: 2,
        produk_id: 1,
        periode: "2025-04-01",
        stok_akhir: 99,
        status_data: "missing",
      },
      {
        id: 3,
        produk_id: 1,
        periode: "2025-03-01",
        stok_akhir: 12,
        status_data: "corrected",
      },
    ],
    { commit: false },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].produk_id, 1);
  assert.equal(report.rows[0].stok_lama, 7);
  assert.equal(report.rows[0].stok_snapshot_terbaru, 12);
  assert.equal(report.rows[0].periode_snapshot, "2025-03-01");
  assert.equal(report.rows[0].selisih, 5);
});

test("buildCurrentStockSyncReport melewati produk yang hanya memiliki snapshot missing", () => {
  const report = buildCurrentStockSyncReport(
    [{ id: 1, nama_produk: "Produk Tanpa Snapshot Valid", stok: 3 }],
    [
      {
        id: 1,
        produk_id: 1,
        periode: "2025-12-01",
        stok_akhir: null,
        status_data: "missing",
      },
    ],
    { commit: false },
  );

  assert.equal(report.rows.length, 0);
  assert.equal(report.skipped_products.length, 1);
  assert.equal(report.skipped_products[0].reason, "no_valid_snapshot");
});

test("syncCurrentStockFromSnapshots dry-run tidak mengubah stok database", async () => {
  const db = createSyncDb({
    products: [{ id: 1, nama_produk: "Aqua", stok: 2, stok_minimum: 5 }],
    snapshots: [{
      id: 1,
      produk_id: 1,
      periode: "2025-12-01",
      stok_akhir: 11,
      status_data: "observed",
    }],
  });

  const report = await syncCurrentStockFromSnapshots(db, { commit: false });

  assert.equal(report.mode, "dry-run");
  assert.equal(report.updated_count, 0);
  assert.equal(db.state.products[0].stok, 2);
  assert.equal(db.state.products[0].stok_minimum, 5);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("UPDATE produk")), false);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("INSERT INTO transaksi")), false);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.trim() === "ROLLBACK"), true);
});

test("syncCurrentStockFromSnapshots commit memperbarui stok dari snapshot terbaru", async () => {
  const db = createSyncDb({
    products: [{ id: 1, nama_produk: "Aqua", stok: 2, stok_minimum: 5 }],
    snapshots: [
      {
        id: 1,
        produk_id: 1,
        periode: "2025-11-01",
        stok_akhir: 7,
        status_data: "observed",
      },
      {
        id: 2,
        produk_id: 1,
        periode: "2025-12-01",
        stok_akhir: 11,
        status_data: "observed",
      },
    ],
  });

  const report = await syncCurrentStockFromSnapshots(db, { commit: true });

  assert.equal(report.mode, "commit");
  assert.equal(report.updated_count, 1);
  assert.equal(db.state.products[0].stok, 11);
  assert.equal(db.state.products[0].stok_minimum, 5);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("UPDATE produk")), true);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.includes("INSERT INTO transaksi")), false);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.trim() === "COMMIT"), true);
});

test("syncCurrentStockFromSnapshots rollback jika update gagal", async () => {
  const db = createSyncDb({
    products: [
      { id: 1, nama_produk: "Aqua", stok: 2 },
      { id: 2, nama_produk: "Coffemix", stok: 4 },
    ],
    snapshots: [
      {
        id: 1,
        produk_id: 1,
        periode: "2025-12-01",
        stok_akhir: 11,
        status_data: "observed",
      },
      {
        id: 2,
        produk_id: 2,
        periode: "2025-12-01",
        stok_akhir: 20,
        status_data: "observed",
      },
    ],
    failUpdateProductId: 2,
  });

  await assert.rejects(
    () => syncCurrentStockFromSnapshots(db, { commit: true }),
    /simulated update failure/,
  );

  assert.equal(db.state.products[0].stok, 2);
  assert.equal(db.state.products[1].stok, 4);
  assert.equal(db.state.transactionQueries.some(({ sql }) => sql.trim() === "ROLLBACK"), true);
});

test("syncCurrentStockFromSnapshots melaporkan produk tanpa snapshot valid", async () => {
  const db = createSyncDb({
    products: [
      { id: 1, nama_produk: "Aqua", stok: 2 },
      { id: 2, nama_produk: "Produk Kosong", stok: 0 },
    ],
    snapshots: [{
      id: 1,
      produk_id: 1,
      periode: "2025-12-01",
      stok_akhir: 11,
      status_data: "observed",
    }],
  });

  const report = await syncCurrentStockFromSnapshots(db, { commit: false });

  assert.equal(report.rows.length, 1);
  assert.equal(report.skipped_products.length, 1);
  assert.equal(report.skipped_products[0].produk_id, 2);
  assert.equal(report.skipped_products[0].reason, "no_valid_snapshot");
});
