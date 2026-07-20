const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SYSTEM_SNAPSHOT_SOURCE,
  buildSnapshotPlan,
  createMonthlySnapshots,
  previousMonthStart,
  resolveSnapshotPeriod,
} = require("../services/monthlySnapshotService");

function createSnapshotDb({ products = [], existing = [] } = {}) {
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
          if (sql.includes("FROM inventory_snapshot_monthly")) return { rows: existing };
          if (sql.includes("INSERT INTO inventory_snapshot_monthly")) return { rows: [] };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

test("monthly snapshot defaults to previous completed calendar month", () => {
  const now = new Date("2026-07-20T10:00:00Z");
  assert.equal(previousMonthStart(now), "2026-06-01");
  assert.equal(resolveSnapshotPeriod(null, now), "2026-06-01");
  assert.throws(() => resolveSnapshotPeriod("2026-08", now), /masa depan/);
});

test("snapshot plan protects corrected and imported snapshots unless forced", () => {
  const products = [
    { id: 1, nama_produk: "A", stok: 5, harga: 1000 },
    { id: 2, nama_produk: "B", stok: 4, harga: 2000 },
  ];
  const existing = [
    { produk_id: 1, status_data: "corrected", sumber_file: "manual" },
    { produk_id: 2, status_data: "observed", sumber_file: SYSTEM_SNAPSHOT_SOURCE },
  ];

  const plan = buildSnapshotPlan(products, existing);
  assert.equal(plan[0].action, "skip");
  assert.equal(plan[1].action, "update");
  assert.equal(plan[1].nilai_aset, 8000);
  assert.equal(buildSnapshotPlan(products, existing, { force: true })[0].action, "update");
});

test("monthly snapshot dry-run never writes and rolls back", async () => {
  const db = createSnapshotDb({
    products: [{ id: 1, nama_produk: "A", stok: 5, harga: 1000 }],
  });

  const result = await createMonthlySnapshots(db, {
    period: "2026-06",
    now: new Date("2026-07-20T00:00:00Z"),
  });

  assert.equal(result.mode, "dry-run");
  assert.equal(db.state.rolledBack, true);
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("INSERT INTO inventory_snapshot_monthly")),
    false,
  );
});

test("monthly snapshot commit upserts system snapshot atomically", async () => {
  const db = createSnapshotDb({
    products: [{ id: 1, nama_produk: "A", stok: 5, harga: 1000 }],
  });

  const result = await createMonthlySnapshots(db, {
    period: "2026-06",
    now: new Date("2026-07-20T00:00:00Z"),
    commit: true,
  });

  assert.equal(result.mode, "commit");
  assert.equal(db.state.committed, true);
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("ON CONFLICT (produk_id, periode)")),
    true,
  );
});
