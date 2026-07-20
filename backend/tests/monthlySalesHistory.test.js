const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMonthlySalesSeries,
  getMonthlySalesHistory,
  previousCompleteMonth,
} = require("../services/monthlySalesHistoryService");
const {
  classifyMonthlySalesReadiness,
} = require("../services/salesForecastReadinessService");

test("buildMonthlySalesSeries fills internal no-sale months with zero", () => {
  const result = buildMonthlySalesSeries([
    { periode: "2026-01-01", total_penjualan: 5 },
    { periode: "2026-03-01", total_penjualan: 2 },
  ], "2026-01", "2026-04");
  assert.deepEqual(result.periods, ["2026-01", "2026-02", "2026-03", "2026-04"]);
  assert.deepEqual(result.values, [5, 0, 2, 0]);
  assert.deepEqual(result.zero_filled_periods, ["2026-02", "2026-04"]);
});

test("previousCompleteMonth excludes the running month", () => {
  assert.equal(previousCompleteMonth(new Date("2026-07-20T00:00:00Z")), "2026-06-01");
});

test("monthly sales history is built from actual outgoing transactions", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("FROM produk")) {
        return { rows: [{ id: 1, nama_produk: "Produk A", is_active: true }] };
      }
      if (sql.includes("first_outgoing_date")) {
        return { rows: [{ first_outgoing_date: "2026-01-05", latest_activity_date: "2026-06-10" }] };
      }
      if (sql.includes("DATE_TRUNC('month', tanggal)")) {
        return { rows: [
          { periode: "2026-01-01", total_penjualan: 5 },
          { periode: "2026-03-01", total_penjualan: 2 },
        ] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const history = await getMonthlySalesHistory(db, 1, {
    referenceDate: new Date("2026-07-20T00:00:00Z"),
  });
  assert.equal(history.source, "actual_outgoing_transactions");
  assert.equal(history.observation_count, 6);
  assert.deepEqual(history.values, [5, 0, 2, 0, 0, 0]);
  assert.equal(history.current_month_excluded, true);
});

test("readiness thresholds distinguish exploration and preview", () => {
  assert.equal(classifyMonthlySalesReadiness(5).status, "insufficient_data");
  assert.equal(classifyMonthlySalesReadiness(8).status, "experimental");
  assert.equal(classifyMonthlySalesReadiness(12).status, "eligible_basic");
  assert.equal(classifyMonthlySalesReadiness(24).status, "eligible_full");
});
