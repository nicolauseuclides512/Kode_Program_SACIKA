const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCurrentStockSyncPlan,
  syncCurrentStockFromSnapshots,
} = require("../services/currentStockSyncService");

function createSyncDb({ products = [], snapshots = [], failUpdate = false } = {}) {
  const state = { queries: [], committed: false, rolledBack: false };
  return {
    state,
    async connect() {
      return {
        async query(sql, params = []) {
          state.queries.push({ sql, params });
          if (sql === "BEGIN") return { rows: [] };
          if (sql === "COMMIT") {
            state.committed = true;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            state.rolledBack = true;
            return { rows: [] };
          }
          if (sql.includes("FROM produk")) return { rows: products };
          if (sql.includes("DISTINCT ON (produk_id)")) return { rows: snapshots };
          if (sql.includes("UPDATE produk")) {
            if (failUpdate) throw new Error("update gagal");
            return { rows: [{ id: params[1] }] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

test("current stock sync selects latest valid snapshot values", () => {
  const plan = buildCurrentStockSyncPlan(
    [
      { id: 1, nama_produk: "A", stok: 2 },
      { id: 2, nama_produk: "B", stok: 3 },
    ],
    [{ produk_id: 1, stok_akhir: 8, periode: "2026-06-01", status_data: "observed" }],
  );

  assert.equal(plan[0].action, "update");
  assert.equal(plan[0].selisih, 6);
  assert.equal(plan[1].action, "skip");
});

test("current stock sync dry-run does not update products", async () => {
  const db = createSyncDb({
    products: [{ id: 1, nama_produk: "A", stok: 2 }],
    snapshots: [{ produk_id: 1, stok_akhir: 8, periode: "2026-06-01", status_data: "observed" }],
  });

  const result = await syncCurrentStockFromSnapshots(db);
  assert.equal(result.mode, "dry-run");
  assert.equal(db.state.rolledBack, true);
  assert.equal(db.state.queries.some(({ sql }) => sql.includes("UPDATE produk")), false);
});

test("current stock sync commit rolls back all changes when one update fails", async () => {
  const db = createSyncDb({
    products: [{ id: 1, nama_produk: "A", stok: 2 }],
    snapshots: [{ produk_id: 1, stok_akhir: 8, periode: "2026-06-01", status_data: "observed" }],
    failUpdate: true,
  });

  await assert.rejects(
    () => syncCurrentStockFromSnapshots(db, { commit: true }),
    /update gagal/,
  );
  assert.equal(db.state.rolledBack, true);
  assert.equal(db.state.committed, false);
});
