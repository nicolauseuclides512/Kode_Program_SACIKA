const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInventoryRiskRows,
  calculateIndicativeRange,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  refreshForecastFreshness,
  runInventoryForecast,
  runInventoryForecastBatch,
} = require("../services/inventoryForecastService");
const {
  createInventoryForecastController,
} = require("../controllers/inventoryForecastController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function createMonthlyRows(count = 24, produkId = 1) {
  const rows = [];
  let year = 2024;
  let month = 1;
  for (let index = 0; index < count; index += 1) {
    rows.push({
      id: (produkId * 1000) + index,
      produk_id: produkId,
      periode: `${year}-${String(month).padStart(2, "0")}-01`,
      stok_akhir: 100 - index,
      status_data: "observed",
      updated_at: `${year}-${String(month).padStart(2, "0")}-15T00:00:00.000Z`,
    });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return rows;
}

function createWorkerResult(productId = 1, horizon = 1) {
  const forecastPeriods = ["2026-01", "2026-02", "2026-03"].slice(0, horizon);
  return {
    product_id: productId,
    target: "ending_inventory",
    frequency: "monthly",
    model_used: "SES",
    forecast_periods: forecastPeriods,
    forecast_values: forecastPeriods.map((_, index) => 85 - index),
    evaluation: { mae: 10.2, rmse: 12.4, wape: 15.6, test_points: 6 },
    candidate_models: [
      { model: "Naive", status: "success", mae: 12, rmse: 13, wape: 18 },
      { model: "SES", status: "success", mae: 10.2, rmse: 12.4, wape: 15.6 },
    ],
    backtest: [
      { period: "2025-07", actual: 90, predicted: 88 },
      { period: "2025-08", actual: 89, predicted: 87 },
    ],
    warning: null,
  };
}

function createMockHttpClient() {
  const calls = [];
  return {
    calls,
    async post(url, payload, config) {
      calls.push({ url, payload, config });
      return { data: createWorkerResult(payload.product_id, payload.horizon) };
    },
  };
}

function createFakeDb(options = {}) {
  const productRows = options.productRows || [{
    id: 1,
    nama_produk: "Aqua Botol 600 ml",
    stok: 20,
    stok_minimum: 5,
    is_active: true,
    active_from: "2024-01-01",
    active_until: null,
  }];
  const historyRows = options.historyRows || createMonthlyRows();
  const executedQueries = [];
  const transactionQueries = [];
  let forecastResultId = 0;
  let forecastRunId = options.forecastRunId || 50;

  return {
    executedQueries,
    transactionQueries,
    async query(sql, params = []) {
      executedQueries.push({ sql, params });

      if (sql.includes("UPDATE forecast_run run") && sql.includes("latest_snapshot")) {
        return { rows: options.staleRows || [] };
      }
      if (sql.includes("WITH latest_run")) return { rows: options.riskRows || [] };
      if (sql.includes("SELECT *") && sql.includes("FROM forecast_run")) {
        return { rows: options.latestRun ? [options.latestRun] : [] };
      }
      if (sql.includes("FROM forecast_result") && sql.includes("forecast_run_id=$1")) {
        return { rows: options.latestRows || [] };
      }
      if (sql.includes("FROM forecast_backtest") && sql.includes("forecast_run_id=$1")) {
        return { rows: options.backtestRows || [] };
      }
      if (sql.includes("FROM produk") && sql.includes("WHERE id=$1")) {
        return { rows: productRows.filter((row) => Number(row.id) === Number(params[0])) };
      }
      if (sql.includes("FROM produk") && sql.includes("ORDER BY id")) {
        return { rows: productRows };
      }
      if (sql.includes("GROUP BY produk_id, periode")) return { rows: [] };
      if (sql.includes("GROUP BY periode")) return { rows: [] };
      if (sql.includes("FROM inventory_snapshot_monthly") && sql.includes("WHERE produk_id=$1")) {
        return { rows: historyRows.filter((row) => Number(row.produk_id) === Number(params[0])) };
      }
      if (sql.includes("FROM inventory_snapshot_monthly")) return { rows: historyRows };
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          transactionQueries.push({ sql, params });
          if (sql.includes("INSERT INTO forecast_run")) {
            return {
              rows: [{
                id: forecastRunId,
                created_at: "2026-01-01T00:00:00.000Z",
                updated_at: "2026-01-01T00:00:00.000Z",
              }],
            };
          }
          if (sql.includes("INSERT INTO forecast_result")) {
            forecastResultId += 1;
            return {
              rows: [{
                id: forecastResultId,
                forecast_period: params[1],
                created_at: "2026-01-01T00:00:00.000Z",
              }],
            };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

test("runInventoryForecast saves one forecast_run, candidate models, backtest, and result ranges", async () => {
  const db = createFakeDb();
  const httpClient = createMockHttpClient();
  const result = await runInventoryForecast(db, 1, {
    horizon: 2,
    httpClient,
    workerUrl: "http://worker.test/",
    timeoutMs: 1234,
  });

  assert.equal(httpClient.calls[0].url, "http://worker.test/predict");
  assert.deepEqual(httpClient.calls[0].payload.periods.slice(0, 2), ["2024-01", "2024-02"]);
  assert.equal(result.forecast_run_id, 50);
  assert.deepEqual(result.forecast_result_ids, [1, 2]);
  assert.deepEqual(result.forecast_ranges, [
    { period: "2026-01", lower_bound: 74.8, upper_bound: 95.2 },
    { period: "2026-02", lower_bound: 73.8, upper_bound: 94.2 },
  ]);
  assert.equal(result.evaluation.test_points, 6);
  assert.equal(result.candidate_models.length, 2);

  const runInsert = db.transactionQueries.find(({ sql }) => sql.includes("INSERT INTO forecast_run"));
  assert.ok(runInsert);
  assert.equal(runInsert.params[1], "ending_inventory");
  assert.equal(runInsert.params[8], 6);
  assert.match(runInsert.params[10], /Naive/);
  assert.equal(
    db.transactionQueries.filter(({ sql }) => sql.includes("INSERT INTO forecast_backtest")).length,
    2,
  );
  assert.equal(
    db.transactionQueries.some(({ sql }) => sql.includes("ON CONFLICT (forecast_run_id, forecast_period)")),
    true,
  );
});

test("runInventoryForecast returns 422 before worker when observations are below minimum", async () => {
  const db = createFakeDb({ historyRows: createMonthlyRows(17) });
  const httpClient = createMockHttpClient();
  await assert.rejects(
    () => runInventoryForecast(db, 1, { httpClient }),
    (error) => error.statusCode === 422 && error.details.observation_count === 17,
  );
  assert.equal(httpClient.calls.length, 0);
});

test("runInventoryForecast handles inactive worker as 503", async () => {
  const db = createFakeDb();
  const httpClient = {
    async post() {
      const error = new Error("connect ECONNREFUSED");
      error.code = "ECONNREFUSED";
      throw error;
    },
  };
  await assert.rejects(
    () => runInventoryForecast(db, 1, { httpClient }),
    (error) => error.statusCode === 503,
  );
});

test("calculateIndicativeRange uses MAE without claiming a confidence interval", () => {
  assert.deepEqual(calculateIndicativeRange(45, 30), {
    lower_bound: 15,
    upper_bound: 75,
  });
  assert.deepEqual(calculateIndicativeRange(10, 30), {
    lower_bound: 0,
    upper_bound: 40,
  });
  assert.deepEqual(calculateIndicativeRange(10, null), {
    lower_bound: null,
    upper_bound: null,
  });
});

test("getLatestInventoryForecast restores run metadata, candidate models, backtest and realized errors", async () => {
  const db = createFakeDb({
    latestRun: {
      id: 50,
      produk_id: 1,
      target: "ending_inventory",
      frequency: "monthly",
      model_used: "SES",
      data_cutoff: "2025-12-01",
      mae: "10.2000",
      rmse: "12.4000",
      wape: "15.6000",
      test_points: 6,
      observation_count: 24,
      candidate_models: [{ model: "SES", mae: 10.2 }],
      warning: null,
      status: "current",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    latestRows: [{
      id: 10,
      forecast_run_id: 50,
      forecast_period: "2026-01-01",
      forecast_value: "85.00",
      lower_bound: "74.80",
      upper_bound: "95.20",
      actual_value: "82.00",
      absolute_error: "3.0000",
      absolute_percentage_error: "3.6585",
      evaluated_at: "2026-02-01T00:00:00.000Z",
    }],
    backtestRows: [{
      period: "2025-07-01",
      actual: "90.00",
      predicted: "88.00",
      absolute_error: "2.00",
    }],
  });

  const result = await getLatestInventoryForecast(db, 1);
  assert.equal(result.forecast_run_id, 50);
  assert.equal(result.freshness, "current");
  assert.equal(result.evaluation.test_points, 6);
  assert.deepEqual(result.forecast_ranges[0], {
    period: "2026-01",
    lower_bound: 74.8,
    upper_bound: 95.2,
  });
  assert.equal(result.candidate_models[0].model, "SES");
  assert.equal(result.backtest[0].absolute_error, 2);
  assert.equal(result.realized_evaluation[0].actual, 82);
});

test("refreshForecastFreshness marks current runs stale when a newer snapshot exists", async () => {
  const db = createFakeDb({
    staleRows: [{
      id: 50,
      produk_id: 1,
      target: "ending_inventory",
      data_cutoff: "2025-12-01",
      latest_period: "2026-01-01",
    }],
  });
  const rows = await refreshForecastFreshness(db, 1);
  assert.equal(rows.length, 1);
  const query = db.executedQueries[0];
  assert.match(query.sql, /status='stale'/);
  assert.deepEqual(query.params, [1]);
});

test("buildInventoryRiskRows includes range and freshness", () => {
  const rows = buildInventoryRiskRows([{
    produk_id: 1,
    nama_produk: "Aqua Botol 600 ml",
    forecast_run_id: 50,
    forecast_period: "2026-01-01",
    forecast_value: "45.00",
    lower_bound: "15.00",
    upper_bound: "75.00",
    stok_minimum: "60.00",
    model_used: "SES",
    data_cutoff: "2025-12-01",
    status: "stale",
    created_at: "2026-01-01T00:00:00.000Z",
  }]);

  assert.deepEqual(rows[0], {
    produk_id: 1,
    nama_produk: "Aqua Botol 600 ml",
    forecast_run_id: 50,
    forecast_period: "2026-01",
    forecast_value: 45,
    lower_bound: 15,
    upper_bound: 75,
    stok_minimum: 60,
    risk: "high",
    model_used: "SES",
    data_cutoff: "2025-12",
    freshness: "stale",
    created_at: "2026-01-01T00:00:00.000Z",
  });
});

test("getInventoryRiskSummary reads forecast_run and excludes superseded runs", async () => {
  const db = createFakeDb({
    riskRows: [{
      produk_id: 1,
      nama_produk: "Aqua Botol 600 ml",
      forecast_run_id: 50,
      forecast_period: "2026-01-01",
      forecast_value: "45.00",
      lower_bound: "15.00",
      upper_bound: "75.00",
      stok_minimum: "60.00",
      model_used: "SES",
      data_cutoff: "2025-12-01",
      status: "current",
      created_at: "2026-01-01T00:00:00.000Z",
    }],
  });
  const result = await getInventoryRiskSummary(db);
  assert.equal(result[0].freshness, "current");
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("status IN ('current', 'stale')")),
    true,
  );
});

test("runInventoryForecastBatch processes eligible active products with bounded concurrency", async () => {
  const productRows = [
    { id: 1, nama_produk: "Produk A", stok: 20, stok_minimum: 5, is_active: true, active_from: "2024-01-01", active_until: null },
    { id: 2, nama_produk: "Produk B", stok: 25, stok_minimum: 5, is_active: true, active_from: "2024-01-01", active_until: null },
    { id: 3, nama_produk: "Produk C", stok: 25, stok_minimum: 5, is_active: false, active_from: "2024-01-01", active_until: "2025-12-01" },
  ];
  const db = createFakeDb({
    productRows,
    historyRows: [
      ...createMonthlyRows(24, 1),
      ...createMonthlyRows(24, 2),
      ...createMonthlyRows(24, 3),
    ],
  });
  const httpClient = createMockHttpClient();
  const result = await runInventoryForecastBatch(db, {
    horizon: 1,
    concurrency: 10,
    httpClient,
  });

  assert.equal(result.concurrency, 5);
  assert.equal(result.eligible_products, 2);
  assert.equal(result.success_count, 2);
  assert.equal(result.failed_count, 0);
  assert.deepEqual(result.results.map((row) => row.produk_id), [1, 2]);
});

test("batch controller returns summary", async () => {
  const db = createFakeDb();
  const controller = createInventoryForecastController(db, { httpClient: createMockHttpClient() });
  const res = createResponse();
  await controller.createInventoryForecastBatch(
    { body: { horizon: 1, concurrency: 1 }, query: {} },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success_count, 1);
});
