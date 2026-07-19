const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StockTransactionError,
  createStockTransaction,
} = require("../services/stockTransactionService");

function createLockedStockDb(initialStock = 10, options = {}) {
  const state = {
    stock: initialStock,
    transactions: [],
    queries: [],
    nextTransactionId: 1,
  };
  let lock = Promise.resolve();
  let unlockCurrent = null;

  const db = {
    state,
    async connect() {
      const client = {
        txStock: state.stock,
        txTransactions: [],
        unlock: null,
        released: false,
        async query(sql, params = []) {
          state.queries.push({ sql, params });

          if (sql === "BEGIN") return { rows: [] };

          if (sql === "COMMIT") {
            state.stock = this.txStock;
            state.transactions.push(...this.txTransactions);
            if (this.unlock) this.unlock();
            this.unlock = null;
            return { rows: [] };
          }

          if (sql === "ROLLBACK") {
            if (this.unlock) this.unlock();
            this.unlock = null;
            return { rows: [] };
          }

          if (sql.includes("FOR UPDATE")) {
            const previousLock = lock;
            let unlockNext;
            lock = new Promise((resolve) => {
              unlockNext = resolve;
            });

            await previousLock;
            unlockCurrent = unlockNext;
            this.unlock = unlockCurrent;
            this.txStock = state.stock;

            if (options.productFound === false) return { rows: [] };
            return { rows: [{ id: params[0], stok: this.txStock }] };
          }

          if (sql.includes("INSERT INTO transaksi")) {
            const id = state.nextTransactionId;
            state.nextTransactionId += 1;
            this.txTransactions.push({
              id,
              produk_id: params[0],
              jenis_transaksi: params[1],
              jumlah: params[2],
            });
            return { rows: [{ id }] };
          }

          if (sql.includes("UPDATE produk")) {
            if (options.throwOnUpdate) {
              throw new Error("update stok gagal");
            }
            this.txStock = params[0];
            return { rows: [{ stok: this.txStock }] };
          }

          return { rows: [] };
        },
        release() {
          this.released = true;
        },
      };

      return client;
    },
  };

  return db;
}

test("createStockTransaction records outgoing transaction atomically with SELECT FOR UPDATE", async () => {
  const db = createLockedStockDb(10);

  const result = await createStockTransaction(db, {
    produk_id: 1,
    jenis_transaksi: "keluar",
    jumlah: 4,
    harga: 2500,
    tanggal: "2026-01-10",
  });

  assert.equal(result.stok_sekarang, 6);
  assert.equal(result.transaksi_id, 1);
  assert.equal(db.state.stock, 6);
  assert.equal(db.state.transactions.length, 1);
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("FOR UPDATE")),
    true,
  );
  assert.equal(
    db.state.queries.some(({ sql }) => sql === "COMMIT"),
    true,
  );
});

test("createStockTransaction rejects outgoing transaction when stock is insufficient and rolls back", async () => {
  const db = createLockedStockDb(2);

  await assert.rejects(
    () => createStockTransaction(db, {
      produk_id: 1,
      jenis_transaksi: "keluar",
      jumlah: 3,
      harga: 2500,
    }),
    (error) => {
      assert.equal(error instanceof StockTransactionError, true);
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /Stok tidak mencukupi/);
      return true;
    },
  );

  assert.equal(db.state.stock, 2);
  assert.equal(db.state.transactions.length, 0);
  assert.equal(
    db.state.queries.some(({ sql }) => sql === "ROLLBACK"),
    true,
  );
});

test("createStockTransaction serializes concurrent outgoing transactions through row lock", async () => {
  const db = createLockedStockDb(10);
  const input = {
    produk_id: 1,
    jenis_transaksi: "keluar",
    jumlah: 6,
    harga: 2500,
  };

  const results = await Promise.allSettled([
    createStockTransaction(db, input),
    createStockTransaction(db, input),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(db.state.stock, 4);
  assert.equal(db.state.transactions.length, 1);
});

test("createStockTransaction rolls back if update stock query fails after insert", async () => {
  const db = createLockedStockDb(10, { throwOnUpdate: true });

  await assert.rejects(
    () => createStockTransaction(db, {
      produk_id: 1,
      jenis_transaksi: "masuk",
      jumlah: 5,
      harga: 2500,
    }),
    /update stok gagal/,
  );

  assert.equal(db.state.stock, 10);
  assert.equal(db.state.transactions.length, 0);
  assert.equal(
    db.state.queries.some(({ sql }) => sql === "ROLLBACK"),
    true,
  );
});

test("createStockTransaction records incoming transaction and stock increment atomically", async () => {
  const db = createLockedStockDb(10);

  const result = await createStockTransaction(db, {
    produk_id: 1,
    jenis_transaksi: "masuk",
    jumlah: 5,
    harga: 2500,
  });

  assert.equal(result.stok_sekarang, 15);
  assert.equal(db.state.stock, 15);
  assert.equal(db.state.transactions.length, 1);
});
