const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInventoryRiskRows,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  runInventoryForecast,
} = require("../services/inventoryForecastService");
const {
  createInventoryForecastController,
} = require("../controllers/inventoryForecastController");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createMonthlyRows(count = 24) {
  const rows = [];
  let year = 2024;
  let month = 1;

  for (let index = 0; index < count; index += 1) {
    rows.push({
      id: index + 1,
      produk_id: 1,
      periode: `${year}-${String(month).padStart(2, "0")}-01`,
      stok_akhir: 100 - index,
      status_data: "observed",
      updated_at: `${year}-${String(month).padStart(2, "0")}-15T00:00:00.000Z`,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return rows;
}

function createWorkerResult(horizon = 1) {
  const forecastPeriods = ["2026-01", "2026-02", "2026-03"].slice(0, horizon);

  return {
    product_id: 1,
    target: "ending_inventory",
    frequency: "monthly",
    model_used: "SES",
    forecast_periods: forecastPeriods,
    forecast_values: forecastPeriods.map((_, index) => 85 - index),
    evaluation: {
      mae: 10.2,
      rmse: 12.4,
      wape: 15.6,
      test_points: 6,
    },
    candidate_models: [
      { model: "Naive", status: "success", mae: 12 },
      { model: "SES", status: "success", mae: 10.2 },
    ],
    backtest: [
      { period: "2025-07", actual: 90, predicted: 88 },
    ],
    warning: null,
  };
}

function createMockHttpClient(workerResult = createWorkerResult()) {
  const calls = [];

  return {
    calls,
    async post(url, payload, config) {
      calls.push({ url, payload, config });
      return { data: workerResult };
    },
  };
}

function createFakeDb(options = {}) {
  const productRows = options.productFound === false
    ? []
    : [{
      id: 1,
      nama_produk: "Aqua Botol 600 ml",
      stok: 20,
      stok_minimum: 5,
    }];
  const historyRows = options.historyRows || createMonthlyRows();
  const latestRows = options.latestRows || [];
  const riskRows = options.riskRows || [];
  const executedQueries = [];
  const transactionQueries = [];
  let forecastId = 0;

  return {
    executedQueries,
    transactionQueries,
    async query(sql, params = []) {
      executedQueries.push({ sql, params });

      if (sql.includes("latest_run")) {
        return { rows: riskRows };
      }

      if (sql.includes("FROM produk")) {
        return { rows: productRows };
      }

      if (sql.includes("GROUP BY periode")) {
        return { rows: [] };
      }

      if (sql.includes("FROM inventory_snapshot_monthly")) {
        return { rows: historyRows };
      }

      if (sql.includes("WITH latest")) {
        return { rows: latestRows };
      }

      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql, params = []) {
          transactionQueries.push({ sql, params });

          if (sql.includes("INSERT INTO forecast_result")) {
            forecastId += 1;
            return {
              rows: [{
                id: forecastId,
                forecast_period: params[4],
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

test("runInventoryForecast sends direct monthly payload to worker and upserts forecast_result", async () => {
  const db = createFakeDb();
  const httpClient = createMockHttpClient(createWorkerResult(2));

  const result = await runInventoryForecast(db, 1, {
    horizon: 2,
    httpClient,
    workerUrl: "http://worker.test/",
    timeoutMs: 1234,
  });

  assert.equal(httpClient.calls.length, 1);
  assert.equal(httpClient.calls[0].url, "http://worker.test/predict");
  assert.equal(httpClient.calls[0].config.timeout, 1234);
  assert.equal(httpClient.calls[0].payload.product_id, 1);
  assert.equal(httpClient.calls[0].payload.target, "ending_inventory");
  assert.equal(httpClient.calls[0].payload.frequency, "monthly");
  assert.deepEqual(httpClient.calls[0].payload.periods.slice(0, 2), ["2024-01", "2024-02"]);
  assert.deepEqual(httpClient.calls[0].payload.values.slice(0, 2), [100, 99]);
  assert.equal(httpClient.calls[0].payload.horizon, 2);

  assert.equal(result.model_used, "SES");
  assert.deepEqual(result.forecast_periods, ["2026-01", "2026-02"]);
  assert.equal(result.data_cutoff, "2025-12");
  assert.deepEqual(result.forecast_result_ids, [1, 2]);
  assert.equal(result.quality.observation_count, 24);

  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("dataset_mingguan")),
    false,
  );
  assert.equal(
    db.transactionQueries.some(({ sql }) => sql.includes("ON CONFLICT (produk_id, data_cutoff, forecast_period, model_used)")),
    true,
  );
});

test("runInventoryForecast returns 422 before worker when observations are below minimum", async () => {
  const db = createFakeDb({ historyRows: createMonthlyRows(17) });
  const httpClient = createMockHttpClient();

  await assert.rejects(
    () => runInventoryForecast(db, 1, { httpClient }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.equal(error.details.observation_count, 17);
      return true;
    },
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
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /Worker forecasting tidak aktif/);
      return true;
    },
  );
});

test("runInventoryForecast preserves worker model-selection failure as 422", async () => {
  const db = createFakeDb();
  const httpClient = {
    async post() {
      const error = new Error("worker returned 422");
      error.response = {
        status: 422,
        data: { status: "failed", error: "Tidak ada model yang berhasil dievaluasi" },
      };
      throw error;
    },
  };

  await assert.rejects(
    () => runInventoryForecast(db, 1, { httpClient }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /belum dapat memilih model/);
      return true;
    },
  );
});

test("runInventoryForecast rejects invalid worker response as 502", async () => {
  const db = createFakeDb();
  const httpClient = createMockHttpClient({
    product_id: 1,
    target: "ending_inventory",
  });

  await assert.rejects(
    () => runInventoryForecast(db, 1, { httpClient }),
    (error) => {
      assert.equal(error.statusCode, 502);
      assert.match(error.message, /Response worker tidak valid/);
      return true;
    },
  );
});

test("getLatestInventoryForecast returns latest saved forecast rows", async () => {
  const db = createFakeDb({
    latestRows: [
      {
        id: 10,
        produk_id: 1,
        target: "ending_inventory",
        model_used: "SES",
        data_cutoff: "2025-12-01",
        forecast_period: "2026-01-01",
        forecast_value: "85.00",
        mae: "10.2000",
        rmse: "12.4000",
        wape: "15.6000",
        observation_count: 24,
        warning: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: 11,
        produk_id: 1,
        target: "ending_inventory",
        model_used: "SES",
        data_cutoff: "2025-12-01",
        forecast_period: "2026-02-01",
        forecast_value: "84.00",
        mae: "10.2000",
        rmse: "12.4000",
        wape: "15.6000",
        observation_count: 24,
        warning: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  const result = await getLatestInventoryForecast(db, 1);

  assert.equal(result.model_used, "SES");
  assert.equal(result.data_cutoff, "2025-12");
  assert.deepEqual(result.forecast_periods, ["2026-01", "2026-02"]);
  assert.deepEqual(result.forecast_values, [85, 84]);
  assert.deepEqual(result.forecast_result_ids, [10, 11]);
});

test("inventory forecast controller maps not eligible quality to HTTP 422", async () => {
  const db = createFakeDb({ historyRows: createMonthlyRows(17) });
  const controller = createInventoryForecastController(db, {
    httpClient: createMockHttpClient(),
  });
  const res = createResponse();

  await controller.createInventoryForecast(
    {
      params: { produk_id: "1" },
      body: { horizon: 1 },
      query: {},
    },
    res,
  );

  assert.equal(res.statusCode, 422);
  assert.equal(res.body.details.observation_count, 17);
});

test("buildInventoryRiskRows uses produk_id and marks high risk from forecast_result rows", () => {
  const rows = buildInventoryRiskRows([
    {
      produk_id: 1,
      nama_produk: "Aqua Botol 600 ml",
      forecast_period: "2026-01-01",
      forecast_value: "45.00",
      stok_minimum: "60.00",
      model_used: "SES",
    },
    {
      produk_id: 2,
      nama_produk: "Coffemix 20 g",
      forecast_period: "2026-01-01",
      forecast_value: "80.00",
      stok_minimum: "20.00",
      model_used: "Naive",
    },
  ]);

  assert.deepEqual(rows, [
    {
      produk_id: 1,
      nama_produk: "Aqua Botol 600 ml",
      forecast_period: "2026-01",
      forecast_value: 45,
      stok_minimum: 60,
      risk: "high",
      model_used: "SES",
    },
    {
      produk_id: 2,
      nama_produk: "Coffemix 20 g",
      forecast_period: "2026-01",
      forecast_value: 80,
      stok_minimum: 20,
      risk: "low",
      model_used: "Naive",
    },
  ]);
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], "id_produk"), false);
});

test("getInventoryRiskSummary reads latest valid forecast_result rows", async () => {
  const db = createFakeDb({
    riskRows: [
      {
        produk_id: 1,
        nama_produk: "Aqua Botol 600 ml",
        forecast_period: "2026-01-01",
        forecast_value: "45.00",
        stok_minimum: "60.00",
        model_used: "SES",
      },
    ],
  });

  const result = await getInventoryRiskSummary(db);

  assert.equal(result.length, 1);
  assert.equal(result[0].produk_id, 1);
  assert.equal(result[0].risk, "high");
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("FROM forecast_result")),
    true,
  );
  assert.equal(
    db.executedQueries.some(({ sql }) => sql.includes("dataset_mingguan")),
    false,
  );
});

test("inventory forecast controller returns inventory risk summary", async () => {
  const db = createFakeDb({
    riskRows: [
      {
        produk_id: 1,
        nama_produk: "Aqua Botol 600 ml",
        forecast_period: "2026-01-01",
        forecast_value: "45.00",
        stok_minimum: "60.00",
        model_used: "SES",
      },
    ],
  });
  const controller = createInventoryForecastController(db);
  const res = createResponse();

  await controller.getInventoryRiskSummary({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    {
      produk_id: 1,
      nama_produk: "Aqua Botol 600 ml",
      forecast_period: "2026-01",
      forecast_value: 45,
      stok_minimum: 60,
      risk: "high",
      model_used: "SES",
    },
  ]);
});
