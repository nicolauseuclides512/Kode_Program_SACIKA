const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildMonthlySalesReadinessResponse,
  classifyMonthlySalesReadiness,
  getMonthlySalesForecastReadiness,
} = require("../services/salesForecastReadinessService");

function createFakeDb(options = {}) {
  const executedQueries = [];
  return {
    executedQueries,
    async query(sql) {
      executedQueries.push(sql);
      if (sql.includes("FROM produk")) {
        return { rows: options.productFound === false ? [] : [{ id: 1, nama_produk: "Produk A" }] };
      }
      if (sql.includes("first_outgoing_date")) {
        return { rows: [{
          first_outgoing_date: options.firstOutgoingDate || "2025-01-03",
          latest_activity_date: options.latestActivityDate || "2025-12-20",
        }] };
      }
      if (sql.includes("DATE_TRUNC('month', tanggal)")) {
        return { rows: Array.from({ length: options.observationCount ?? 12 }, (_, index) => ({
          periode: `2025-${String(index + 1).padStart(2, "0")}-01`,
          total_penjualan: index + 1,
        })) };
      }
      return { rows: [] };
    },
  };
}

test("classifyMonthlySalesReadiness follows insufficient, experimental, basic, and full thresholds", () => {
  assert.equal(classifyMonthlySalesReadiness(5).status, "insufficient_data");
  assert.equal(classifyMonthlySalesReadiness(8).status, "experimental");
  assert.equal(classifyMonthlySalesReadiness(12).status, "eligible_basic");
  assert.equal(classifyMonthlySalesReadiness(24).status, "eligible_full");
});

test("readiness response keeps monthly_sales separate and marks preview capability", () => {
  const result = buildMonthlySalesReadinessResponse(8);
  assert.equal(result.target, "monthly_sales");
  assert.equal(result.source, "actual_outgoing_transactions");
  assert.equal(result.preview_enabled, false);
  assert.equal(result.minimum_preview_observations, 12);
});

test("readiness is derived from outgoing transaction history", async () => {
  const db = createFakeDb({ observationCount: 12 });
  const result = await getMonthlySalesForecastReadiness(db, 1, {
    referenceDate: new Date("2026-01-20T00:00:00Z"),
  });
  assert.equal(result.status, "eligible_basic");
  assert.equal(result.observation_count, 12);
  assert.equal(db.executedQueries.some((sql) => sql.includes("FROM transaksi")), true);
  assert.equal(db.executedQueries.some((sql) => sql.includes("inventory_snapshot_monthly")), false);
  assert.equal(db.executedQueries.some((sql) => sql.includes("dataset_mingguan")), false);
});

test("readiness validates missing product", async () => {
  const db = createFakeDb({ productFound: false });
  await assert.rejects(
    () => getMonthlySalesForecastReadiness(db, 1),
    (error) => error.statusCode === 404 && error.message === "Produk tidak ditemukan",
  );
});

test("sales forecast routes expose history, readiness, and admin preview", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../routes/salesForecastRoutes.js"),
    "utf8",
  );
  assert.match(source, /\/\:produk_id\/history/);
  assert.match(source, /\/\:produk_id\/readiness/);
  assert.match(source, /\/\:produk_id\/preview/);
  assert.match(source, /allowRoles\("admin"\)/);
});
