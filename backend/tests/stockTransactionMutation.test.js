const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StockTransactionError,
  deleteStockTransaction,
  updateStockTransaction,
} = require("../services/stockTransactionService");

function cloneMap(map) {
  return new Map([...map.entries()].map(([key, value]) => [key, { ...value }]));
}

function createMutationDb({ products, transactions, failOnTransactionUpdate = false }) {
  const state = {
    products: new Map(products.map((row) => [row.id, { ...row }])),
    transactions: new Map(transactions.map((row) => [row.id, { ...row }])),
    queries: [],
    committed: false,
    rolledBack: false,
  };

  return {
    state,
    async connect() {
      const client = {
        products: cloneMap(state.products),
        transactions: cloneMap(state.transactions),
        async query(sql, params = []) {
          state.queries.push({ sql, params });
          const normalized = sql.replace(/\s+/g, " ").trim();

          if (sql === "BEGIN") return { rows: [] };
          if (sql === "COMMIT") {
            state.products = this.products;
            state.transactions = this.transactions;
            state.committed = true;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            state.rolledBack = true;
            return { rows: [] };
          }

          if (normalized.includes("FROM transaksi") && normalized.includes("WHERE id=$1") && normalized.includes("FOR UPDATE")) {
            const row = this.transactions.get(Number(params[0]));
            return { rows: row ? [{ ...row }] : [] };
          }

          if (normalized.includes("FROM produk") && normalized.includes("ANY($1::bigint[])")) {
            return {
              rows: params[0]
                .map(Number)
                .filter((id) => this.products.has(id))
                .map((id) => ({ id, stok: this.products.get(id).stok })),
            };
          }

          if (normalized.startsWith("UPDATE transaksi")) {
            if (failOnTransactionUpdate) throw new Error("update transaksi gagal");
            const id = Number(params[6]);
            if (!this.transactions.has(id)) return { rows: [] };
            this.transactions.set(id, {
              id,
              produk_id: Number(params[0]),
              jenis_transaksi: params[1],
              jumlah: Number(params[2]),
              harga: Number(params[3]),
              total: Number(params[4]),
              tanggal: params[5],
            });
            return { rows: [{ id }] };
          }

          if (normalized.startsWith("DELETE FROM transaksi")) {
            const id = Number(params[0]);
            const existed = this.transactions.delete(id);
            return { rows: existed ? [{ id }] : [] };
          }

          if (normalized.startsWith("UPDATE produk")) {
            const id = Number(params[1]);
            if (!this.products.has(id)) return { rows: [] };
            this.products.get(id).stok = Number(params[0]);
            return { rows: [{ id, stok: Number(params[0]) }] };
          }

          if (normalized.includes("SELECT COALESCE(SUM(jumlah), 0)")) {
            return { rows: [{ total_penjualan: 0 }] };
          }

          if (
            normalized.startsWith("DELETE FROM dataset_mingguan")
            || normalized.startsWith("DELETE FROM penjualan_bulanan")
          ) {
            return { rows: [] };
          }

          return { rows: [] };
        },
        release() {},
      };

      return client;
    },
  };
}

test("updateStockTransaction atomically reverses old effect and applies new effect", async () => {
  const db = createMutationDb({
    products: [{ id: 1, stok: 10 }],
    transactions: [{
      id: 5,
      produk_id: 1,
      jenis_transaksi: "masuk",
      jumlah: 5,
      harga: 1000,
      total: 5000,
      tanggal: "2026-06-02",
    }],
  });

  const result = await updateStockTransaction(db, 5, {
    jenis_transaksi: "keluar",
    jumlah: 3,
    harga: 1000,
    tanggal: "2026-06-10",
  });

  assert.equal(result.stok_sekarang, 2);
  assert.equal(db.state.products.get(1).stok, 2);
  assert.equal(db.state.transactions.get(5).jenis_transaksi, "keluar");
  assert.equal(db.state.committed, true);
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("FOR UPDATE")),
    true,
  );
});

test("updateStockTransaction recognizes destination product whose stock is zero", async () => {
  const db = createMutationDb({
    products: [{ id: 1, stok: 5 }, { id: 2, stok: 0 }],
    transactions: [{
      id: 6,
      produk_id: 1,
      jenis_transaksi: "masuk",
      jumlah: 5,
      harga: 1000,
      total: 5000,
      tanggal: "2026-06-02",
    }],
  });

  const result = await updateStockTransaction(db, 6, {
    produk_id: 2,
    jenis_transaksi: "masuk",
    jumlah: 2,
    harga: 1000,
  });

  assert.equal(result.stok_sekarang, 2);
  assert.equal(db.state.products.get(1).stok, 0);
  assert.equal(db.state.products.get(2).stok, 2);
});

test("updateStockTransaction rolls back transaction and stock together", async () => {
  const db = createMutationDb({
    products: [{ id: 1, stok: 10 }],
    transactions: [{
      id: 7,
      produk_id: 1,
      jenis_transaksi: "masuk",
      jumlah: 5,
      harga: 1000,
      total: 5000,
      tanggal: "2026-06-02",
    }],
    failOnTransactionUpdate: true,
  });

  await assert.rejects(
    () => updateStockTransaction(db, 7, { jumlah: 4 }),
    /update transaksi gagal/,
  );
  assert.equal(db.state.products.get(1).stok, 10);
  assert.equal(db.state.transactions.get(7).jumlah, 5);
  assert.equal(db.state.rolledBack, true);
});

test("deleteStockTransaction reverses an outgoing transaction atomically", async () => {
  const db = createMutationDb({
    products: [{ id: 1, stok: 2 }],
    transactions: [{
      id: 8,
      produk_id: 1,
      jenis_transaksi: "keluar",
      jumlah: 3,
      harga: 1000,
      total: 3000,
      tanggal: "2026-06-02",
    }],
  });

  const result = await deleteStockTransaction(db, 8);
  assert.equal(result.stok_sekarang, 5);
  assert.equal(db.state.products.get(1).stok, 5);
  assert.equal(db.state.transactions.has(8), false);
  assert.equal(db.state.committed, true);
});

test("deleteStockTransaction rejects removal of incoming stock already consumed", async () => {
  const db = createMutationDb({
    products: [{ id: 1, stok: 2 }],
    transactions: [{
      id: 9,
      produk_id: 1,
      jenis_transaksi: "masuk",
      jumlah: 5,
      harga: 1000,
      total: 5000,
      tanggal: "2026-06-02",
    }],
  });

  await assert.rejects(
    () => deleteStockTransaction(db, 9),
    (error) => {
      assert.equal(error instanceof StockTransactionError, true);
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(db.state.products.get(1).stok, 2);
  assert.equal(db.state.transactions.has(9), true);
  assert.equal(db.state.rolledBack, true);
});
