const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runMonthlySalesForecastPreview,
  validateSalesWorkerResponse,
} = require("../services/salesForecastService");

function workerResponse() {
  return {
    product_id: 1,
    target: "monthly_sales",
    frequency: "monthly",
    model_used: "Naive",
    forecast_periods: ["2026-01"],
    forecast_values: [4],
    evaluation: { mae: 1, rmse: 1.2, wape: 20, test_points: 6 },
    candidate_models: [],
    backtest: [],
    warning: null,
  };
}

test("sales worker response requires monthly_sales target", () => {
  assert.equal(validateSalesWorkerResponse(workerResponse(), 1).target, "monthly_sales");
  assert.throws(
    () => validateSalesWorkerResponse({ ...workerResponse(), target: "ending_inventory" }, 1),
    /Response worker penjualan tidak valid/,
  );
});

test("sales preview stays experimental and never returns purchase quantity", async () => {
  const monthlyRows = Array.from({ length: 12 }, (_, index) => ({
    periode: `2025-${String(index + 1).padStart(2, "0")}-01`,
    total_penjualan: index + 1,
  }));
  const db = {
    async query(sql) {
      if (sql.includes("FROM produk")) return { rows: [{ id: 1, nama_produk: "Produk A" }] };
      if (sql.includes("first_outgoing_date")) {
        return { rows: [{ first_outgoing_date: "2025-01-03", latest_activity_date: "2025-12-20" }] };
      }
      if (sql.includes("DATE_TRUNC('month', tanggal)")) return { rows: monthlyRows };
      throw new Error(`Unexpected top-level SQL: ${sql}`);
    },
    async connect() {
      return {
        async query(sql) {
          if (/^\s*(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
          if (sql.includes("INSERT INTO forecast_run")) return { rows: [{ id: 9, created_at: "2026-01-01" }] };
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  const httpClient = { async post() { return { data: workerResponse() }; } };
  const result = await runMonthlySalesForecastPreview(db, 1, {
    httpClient,
    workerApiKey: "test-key",
    workerUrl: "http://worker",
  });
  assert.equal(result.experimental, true);
  assert.equal(result.usage_notice.procurement_recommendation, false);
  assert.equal(Object.hasOwn(result, "recommended_purchase_quantity"), false);
  assert.equal(result.source, "actual_outgoing_transactions");
});
