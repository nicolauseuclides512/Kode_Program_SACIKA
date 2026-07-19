const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateMonthlySalesRows,
  aggregateWeeklySalesRows,
  runSalesAggregation,
} = require("../services/salesAggregationService");

function createAggregationDb(transactions = []) {
  const state = {
    transactions,
    datasetMingguan: new Map(),
    penjualanBulanan: new Map(),
    queries: [],
  };

  return {
    state,
    async connect() {
      const client = {
        weekly: new Map(state.datasetMingguan),
        monthly: new Map(state.penjualanBulanan),
        async query(sql, params = []) {
          state.queries.push({ sql, params });

          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
            if (sql === "COMMIT") {
              state.datasetMingguan = this.weekly;
              state.penjualanBulanan = this.monthly;
            }
            return { rows: [] };
          }

          if (sql.includes("FROM transaksi")) {
            return {
              rows: state.transactions
                .filter((row) => row.jenis_transaksi === "keluar")
                .map((row) => ({
                  produk_id: row.produk_id,
                  tanggal: row.tanggal,
                  jumlah: row.jumlah,
                })),
            };
          }

          if (sql.includes("DELETE FROM dataset_mingguan")) {
            this.weekly = new Map();
            return { rows: [] };
          }

          if (sql.includes("DELETE FROM penjualan_bulanan")) {
            this.monthly = new Map();
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO dataset_mingguan")) {
            const key = `${params[0]}-${params[4]}`;
            this.weekly.set(key, {
              produk_id: params[0],
              period_label: params[4],
              total_penjualan: params[5],
            });
            return { rows: [] };
          }

          if (sql.includes("INSERT INTO penjualan_bulanan")) {
            const key = `${params[0]}-${params[1]}`;
            this.monthly.set(key, {
              produk_id: params[0],
              periode: params[1],
              total_penjualan: params[2],
            });
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

test("aggregateWeeklySalesRows only aggregates recorded outgoing transaction rows", () => {
  const rows = aggregateWeeklySalesRows([
    { produk_id: 1, tanggal: new Date("2026-01-02"), jumlah: 3 },
    { produk_id: 1, tanggal: new Date("2026-01-04"), jumlah: 4 },
    { produk_id: 1, tanggal: new Date("2026-01-22"), jumlah: 2 },
  ]);

  assert.deepEqual(rows, [
    {
      produk_id: 1,
      tahun: 2026,
      bulan: 1,
      minggu_ke: 1,
      period_label: "Jan 26-W1",
      total_penjualan: 7,
    },
    {
      produk_id: 1,
      tahun: 2026,
      bulan: 1,
      minggu_ke: 4,
      period_label: "Jan 26-W4",
      total_penjualan: 2,
    },
  ]);
});

test("aggregateMonthlySalesRows prepares monthly sales without inventory snapshots", () => {
  const rows = aggregateMonthlySalesRows([
    { produk_id: 1, tanggal: new Date("2026-01-02"), jumlah: 3 },
    { produk_id: 1, tanggal: new Date("2026-01-22"), jumlah: 4 },
    { produk_id: 2, tanggal: new Date("2026-02-01"), jumlah: 5 },
  ]);

  assert.deepEqual(rows, [
    { produk_id: 1, periode: "2026-01-01", total_penjualan: 7 },
    { produk_id: 2, periode: "2026-02-01", total_penjualan: 5 },
  ]);
});

test("runSalesAggregation is idempotent when executed twice and does not double totals", async () => {
  const db = createAggregationDb([
    { produk_id: 1, tanggal: new Date("2026-01-02"), jumlah: 3, jenis_transaksi: "keluar" },
    { produk_id: 1, tanggal: new Date("2026-01-04"), jumlah: 4, jenis_transaksi: "keluar" },
    { produk_id: 1, tanggal: new Date("2026-01-05"), jumlah: 100, jenis_transaksi: "masuk" },
  ]);

  await runSalesAggregation(db);
  await runSalesAggregation(db);

  assert.equal(db.state.datasetMingguan.get("1-Jan 26-W1").total_penjualan, 7);
  assert.equal(db.state.penjualanBulanan.get("1-2026-01-01").total_penjualan, 7);
  assert.equal(db.state.datasetMingguan.size, 1);
  assert.equal(db.state.penjualanBulanan.size, 1);
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("total_penjualan = dataset_mingguan.total_penjualan + EXCLUDED.total_penjualan")),
    false,
  );
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("total_penjualan = EXCLUDED.total_penjualan")),
    true,
  );
  assert.equal(
    db.state.queries.some(({ sql }) => sql.includes("inventory_snapshot_monthly")),
    false,
  );
});
