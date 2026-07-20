const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEvaluationMetrics,
  evaluateForecastsAgainstActuals,
  parsePeriod,
} = require("../services/forecastActualEvaluationService");

test("buildEvaluationMetrics compares saved forecast with realized stock", () => {
  assert.deepEqual(buildEvaluationMetrics(85, 82), {
    actual_value: 82,
    signed_error: -3,
    absolute_error: 3,
    squared_error: 9,
    absolute_percentage_error: (3 / 82) * 100,
  });
  assert.equal(buildEvaluationMetrics(5, 0).absolute_percentage_error, null);
});

test("parsePeriod normalizes month and rejects invalid values", () => {
  assert.equal(parsePeriod("2026-01"), "2026-01-01");
  assert.throws(() => parsePeriod("2026-13"), /YYYY-MM/);
});

test("evaluateForecastsAgainstActuals updates pending results atomically", async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes("SELECT") && sql.includes("snapshot.stok_akhir")) {
        return {
          rows: [
            {
              forecast_result_id: 10,
              forecast_run_id: 50,
              produk_id: 1,
              target: "ending_inventory",
              forecast_period: "2026-01-01",
              forecast_value: "85.00",
              actual_value: "82.00",
            },
            {
              forecast_result_id: 11,
              forecast_run_id: 51,
              produk_id: 2,
              target: "ending_inventory",
              forecast_period: "2026-01-01",
              forecast_value: "10.00",
              actual_value: "0.00",
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const db = { async connect() { return client; } };

  const result = await evaluateForecastsAgainstActuals(db, { period: "2026-01" });
  assert.equal(result.evaluated_count, 2);
  assert.equal(result.metrics.mae, 6.5);
  assert.equal(result.metrics.rmse, Math.sqrt(54.5));
  assert.equal(result.metrics.wape, (13 / 82) * 100);
  assert.equal(result.rows[1].absolute_percentage_error, null);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls.at(-1).sql, "COMMIT");
  assert.equal(calls.filter(({ sql }) => sql.includes("UPDATE forecast_result")).length, 2);
});

test("evaluateForecastsAgainstActuals rolls back when update fails", async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes("snapshot.stok_akhir")) {
        return {
          rows: [{
            forecast_result_id: 10,
            forecast_run_id: 50,
            produk_id: 1,
            target: "ending_inventory",
            forecast_period: "2026-01-01",
            forecast_value: "85.00",
            actual_value: "82.00",
          }],
        };
      }
      if (sql.includes("UPDATE forecast_result")) throw new Error("database failure");
      return { rows: [] };
    },
    release() {},
  };
  const db = { async connect() { return client; } };

  await assert.rejects(() => evaluateForecastsAgainstActuals(db), /database failure/);
  assert.equal(calls.includes("ROLLBACK"), true);
});
