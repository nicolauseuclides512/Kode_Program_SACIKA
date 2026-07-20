const axios = require("axios");
const { getForecastWorkerApiKey } = require("../config/security");

const {
  findLatestContiguousSegment,
  getInventoryHistory,
  getProductQuality,
  getQualitySummary,
} = require("./inventoryHistoryQualityService");
const { FORECAST_TARGETS } = require("./forecastTargets");

const TARGET = FORECAST_TARGETS.ENDING_INVENTORY;
const FREQUENCY = "monthly";
const MIN_OBSERVATION_COUNT = 18;
const DEFAULT_WORKER_URL = "http://localhost:5000";
const DEFAULT_WORKER_TIMEOUT_MS = 10000;
const DEFAULT_BATCH_CONCURRENCY = 2;
const MAX_BATCH_CONCURRENCY = 5;
const MAX_BATCH_PRODUCTS = 500;

class InventoryForecastError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function getWorkerUrl() {
  return process.env.FORECAST_WORKER_URL
    || process.env.WORKER_URL
    || DEFAULT_WORKER_URL;
}

function getWorkerTimeoutMs() {
  const timeout = Number(process.env.FORECAST_WORKER_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0
    ? timeout
    : DEFAULT_WORKER_TIMEOUT_MS;
}

function parseProdukId(value) {
  const produkId = Number(value);
  if (!Number.isInteger(produkId) || produkId <= 0) {
    throw new InventoryForecastError(400, "produk_id harus angka valid");
  }

  return produkId;
}

function parseHorizon(value) {
  if (value === undefined || value === null || value === "") return 1;

  const horizon = Number(value);
  if (!Number.isInteger(horizon) || horizon <= 0) {
    throw new InventoryForecastError(400, "horizon harus integer positif");
  }

  if (horizon > 3) {
    throw new InventoryForecastError(400, "horizon maksimum sementara adalah 3 bulan");
  }

  return horizon;
}

function parseBatchConcurrency(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_BATCH_CONCURRENCY;
  }

  const concurrency = Number(value);
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new InventoryForecastError(400, "concurrency harus integer positif");
  }

  return Math.min(concurrency, MAX_BATCH_CONCURRENCY);
}

function parseBatchProductIds(value) {
  if (value === undefined || value === null || value === "") return null;
  const source = Array.isArray(value) ? value : String(value).split(",");
  const ids = Array.from(new Set(source.map((item) => Number(item))));

  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new InventoryForecastError(400, "product_ids harus berisi ID produk yang valid");
  }

  if (ids.length > MAX_BATCH_PRODUCTS) {
    throw new InventoryForecastError(
      400,
      `Jumlah product_ids maksimum ${MAX_BATCH_PRODUCTS}`,
    );
  }

  return ids;
}

function monthToDate(period, fieldName = "periode") {
  const text = String(period || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-01)?$/);

  if (!match) {
    throw new InventoryForecastError(502, `${fieldName} tidak valid`);
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new InventoryForecastError(502, `${fieldName} memiliki bulan tidak valid`);
  }

  return `${match[1]}-${match[2]}-01`;
}

function formatMonth(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  return String(value).slice(0, 7);
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function calculateIndicativeRange(forecastValue, mae) {
  const point = toNumberOrNull(forecastValue);
  const error = toNumberOrNull(mae);

  if (point === null || error === null) {
    return { lower_bound: null, upper_bound: null };
  }

  return {
    lower_bound: Math.max(0, point - error),
    upper_bound: point + error,
  };
}

function selectForecastTrainingHistory(history, minObservationCount = MIN_OBSERVATION_COUNT) {
  if (!history || !Array.isArray(history.periods) || !Array.isArray(history.values)) {
    throw new InventoryForecastError(422, "Histori persediaan bulanan tidak valid");
  }

  const segment = history.latest_contiguous_segment
    || findLatestContiguousSegment(history.periods, history.values);

  if (segment.observation_count < minObservationCount) {
    throw new InventoryForecastError(
      422,
      "Histori persediaan belum memiliki segmen bulanan kontinu yang cukup",
      {
        latest_contiguous_observation_count: segment.observation_count,
        minimum_observation_count: minObservationCount,
        latest_contiguous_period_start: segment.period_start,
        latest_contiguous_period_end: segment.period_end,
        missing_periods: history.missing_periods || [],
      },
    );
  }

  return {
    ...history,
    periods: [...segment.periods],
    values: [...segment.values],
    observation_count: segment.observation_count,
    missing_periods: [],
    source_observation_count: history.observation_count,
    source_missing_periods: history.missing_periods || [],
    training_period_start: segment.period_start,
    training_period_end: segment.period_end,
  };
}

function buildWorkerPayload(produkId, history, horizon = 1) {
  const trainingHistory = selectForecastTrainingHistory(history);

  return {
    product_id: produkId,
    target: TARGET,
    frequency: FREQUENCY,
    periods: trainingHistory.periods,
    values: trainingHistory.values,
    horizon,
  };
}

function validateWorkerResponse(workerResult, produkId) {
  const errors = [];

  if (!workerResult || typeof workerResult !== "object" || Array.isArray(workerResult)) {
    throw new InventoryForecastError(502, "Response worker tidak valid");
  }

  if (Number(workerResult.product_id) !== produkId) errors.push("product_id worker tidak sesuai");
  if (workerResult.target !== TARGET) errors.push("target worker harus ending_inventory");
  if (workerResult.frequency !== FREQUENCY) errors.push("frequency worker harus monthly");
  if (!workerResult.model_used || typeof workerResult.model_used !== "string") {
    errors.push("model_used worker wajib string");
  }

  if (!Array.isArray(workerResult.forecast_periods) || workerResult.forecast_periods.length === 0) {
    errors.push("forecast_periods worker wajib array tidak kosong");
  }
  if (!Array.isArray(workerResult.forecast_values) || workerResult.forecast_values.length === 0) {
    errors.push("forecast_values worker wajib array tidak kosong");
  }
  if (
    Array.isArray(workerResult.forecast_periods)
    && Array.isArray(workerResult.forecast_values)
    && workerResult.forecast_periods.length !== workerResult.forecast_values.length
  ) {
    errors.push("panjang forecast_periods dan forecast_values worker harus sama");
  }

  if (Array.isArray(workerResult.forecast_periods)) {
    for (const period of workerResult.forecast_periods) monthToDate(period, "forecast_period");
  }

  if (Array.isArray(workerResult.forecast_values)) {
    for (const value of workerResult.forecast_values) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        errors.push("forecast_values worker harus numerik dan tidak negatif");
        break;
      }
    }
  }

  if (!workerResult.evaluation || typeof workerResult.evaluation !== "object") {
    errors.push("evaluation worker wajib object");
  } else if (
    workerResult.evaluation.test_points !== undefined
    && (!Number.isInteger(Number(workerResult.evaluation.test_points))
      || Number(workerResult.evaluation.test_points) < 0)
  ) {
    errors.push("evaluation.test_points worker harus integer non-negatif");
  }

  if (workerResult.candidate_models !== undefined && !Array.isArray(workerResult.candidate_models)) {
    errors.push("candidate_models worker harus array");
  }
  if (workerResult.backtest !== undefined && !Array.isArray(workerResult.backtest)) {
    errors.push("backtest worker harus array");
  }
  if (
    workerResult.selection !== undefined
    && (typeof workerResult.selection !== "object" || Array.isArray(workerResult.selection))
  ) {
    errors.push("selection worker harus object");
  }

  if (errors.length > 0) {
    throw new InventoryForecastError(502, "Response worker tidak valid", errors);
  }

  return {
    ...workerResult,
    product_id: produkId,
    target: TARGET,
    frequency: FREQUENCY,
    forecast_values: workerResult.forecast_values.map((value) => Number(value)),
    candidate_models: workerResult.candidate_models || [],
    backtest: workerResult.backtest || [],
    selection: workerResult.selection || null,
  };
}

async function callForecastWorker(payload, options = {}) {
  const httpClient = options.httpClient || axios;
  const workerUrl = (options.workerUrl || getWorkerUrl()).replace(/\/+$/, "");
  const timeout = options.timeoutMs || getWorkerTimeoutMs();
  const workerApiKey = options.workerApiKey || getForecastWorkerApiKey();

  try {
    const response = await httpClient.post(`${workerUrl}/predict`, payload, {
      timeout,
      headers: {
        "Content-Type": "application/json",
        "X-Worker-API-Key": workerApiKey,
      },
    });
    return response.data;
  } catch (error) {
    if (!error.response) {
      throw new InventoryForecastError(
        503,
        "Worker forecasting tidak aktif atau timeout",
        { code: error.code || null, message: error.message },
      );
    }

    const workerStatus = Number(error.response.status);
    if ([401, 403].includes(workerStatus)) {
      throw new InventoryForecastError(
        502,
        "Autentikasi backend ke worker forecasting gagal",
      );
    }

    if (workerStatus === 503) {
      throw new InventoryForecastError(
        503,
        "Worker forecasting belum dikonfigurasi atau sedang tidak tersedia",
      );
    }

    const statusCode = workerStatus === 422 ? 422 : 502;
    const message = workerStatus === 422
      ? "Worker forecasting belum dapat memilih model"
      : "Worker forecasting gagal memproses request";

    throw new InventoryForecastError(
      statusCode,
      message,
      workerStatus === 422 ? { status: workerStatus } : null,
    );
  }
}

function warningToText(warning) {
  if (warning === null || warning === undefined) return null;
  if (Array.isArray(warning)) return warning.join("; ");
  return String(warning);
}

function getDataCutoff(history) {
  if (!history.periods || history.periods.length === 0) {
    throw new InventoryForecastError(404, "Produk tidak mempunyai histori persediaan bulanan");
  }
  return monthToDate(history.periods[history.periods.length - 1], "data_cutoff");
}

async function withTransaction(db, callback) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function saveBacktestRows(client, forecastRunId, rows = []) {
  await client.query("DELETE FROM forecast_backtest WHERE forecast_run_id=$1", [forecastRunId]);

  for (const row of rows) {
    const actual = toNumberOrNull(row.actual);
    const predicted = toNumberOrNull(row.predicted);
    if (actual === null || predicted === null || actual < 0 || predicted < 0) continue;

    await client.query(
      `
        INSERT INTO forecast_backtest (
          forecast_run_id, period, actual, predicted, absolute_error
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (forecast_run_id, period)
        DO UPDATE SET
          actual = EXCLUDED.actual,
          predicted = EXCLUDED.predicted,
          absolute_error = EXCLUDED.absolute_error
      `,
      [
        forecastRunId,
        monthToDate(row.period, "backtest.period"),
        actual,
        predicted,
        Math.abs(actual - predicted),
      ],
    );
  }
}

async function saveForecastResults(db, produkId, history, workerResult) {
  const dataCutoff = getDataCutoff(history);
  const evaluation = workerResult.evaluation || {};
  const warning = warningToText(workerResult.warning);
  const mae = toNumberOrNull(evaluation.mae);

  return withTransaction(db, async (client) => {
    await client.query(
      `
        UPDATE forecast_run
        SET status='superseded', updated_at=NOW()
        WHERE produk_id=$1 AND target=$2 AND status IN ('current', 'stale')
      `,
      [produkId, TARGET],
    );

    const runResult = await client.query(
      `
        INSERT INTO forecast_run (
          produk_id,
          target,
          frequency,
          model_used,
          data_cutoff,
          mae,
          rmse,
          wape,
          test_points,
          observation_count,
          candidate_models,
          warning,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, 'current')
        ON CONFLICT (produk_id, target, data_cutoff, model_used)
        DO UPDATE SET
          frequency = EXCLUDED.frequency,
          mae = EXCLUDED.mae,
          rmse = EXCLUDED.rmse,
          wape = EXCLUDED.wape,
          test_points = EXCLUDED.test_points,
          observation_count = EXCLUDED.observation_count,
          candidate_models = EXCLUDED.candidate_models,
          warning = EXCLUDED.warning,
          status = 'current',
          updated_at = NOW()
        RETURNING id, created_at, updated_at
      `,
      [
        produkId,
        TARGET,
        FREQUENCY,
        workerResult.model_used,
        dataCutoff,
        mae,
        toNumberOrNull(evaluation.rmse),
        toNumberOrNull(evaluation.wape),
        Number(evaluation.test_points || 0),
        history.observation_count,
        JSON.stringify(workerResult.candidate_models || []),
        warning,
      ],
    );

    const forecastRun = runResult.rows[0];
    const forecastRunId = Number(forecastRun.id);
    await client.query("DELETE FROM forecast_result WHERE forecast_run_id=$1", [forecastRunId]);

    const savedRows = [];
    const ranges = [];
    for (let index = 0; index < workerResult.forecast_periods.length; index += 1) {
      const forecastPeriod = monthToDate(workerResult.forecast_periods[index], "forecast_period");
      const forecastValue = Number(workerResult.forecast_values[index]);
      const range = calculateIndicativeRange(forecastValue, mae);

      const result = await client.query(
        `
          INSERT INTO forecast_result (
            forecast_run_id,
            forecast_period,
            forecast_value,
            lower_bound,
            upper_bound
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (forecast_run_id, forecast_period)
          DO UPDATE SET
            forecast_value = EXCLUDED.forecast_value,
            lower_bound = EXCLUDED.lower_bound,
            upper_bound = EXCLUDED.upper_bound,
            actual_value = NULL,
            absolute_error = NULL,
            squared_error = NULL,
            absolute_percentage_error = NULL,
            evaluated_at = NULL,
            created_at = NOW()
          RETURNING id, forecast_period, created_at
        `,
        [forecastRunId, forecastPeriod, forecastValue, range.lower_bound, range.upper_bound],
      );

      savedRows.push(result.rows[0]);
      ranges.push({ period: formatMonth(forecastPeriod), ...range });
    }

    await saveBacktestRows(client, forecastRunId, workerResult.backtest || []);

    return {
      forecast_run_id: forecastRunId,
      data_cutoff: formatMonth(dataCutoff),
      status: "current",
      forecast_result_ids: savedRows.map((row) => Number(row.id)),
      forecast_ranges: ranges,
    };
  });
}

async function refreshForecastFreshness(db, produkIdInput = null) {
  const produkId = produkIdInput === null ? null : parseProdukId(produkIdInput);
  const result = await db.query(
    `
      WITH latest_snapshot AS (
        SELECT produk_id, MAX(periode) AS latest_period
        FROM inventory_snapshot_monthly
        WHERE status_data IN ('observed', 'corrected')
        GROUP BY produk_id
      )
      UPDATE forecast_run run
      SET status='stale', updated_at=NOW()
      FROM latest_snapshot snapshot
      WHERE run.produk_id = snapshot.produk_id
        AND run.status = 'current'
        AND run.data_cutoff < snapshot.latest_period
        AND ($1::integer IS NULL OR run.produk_id=$1)
      RETURNING run.id, run.produk_id, run.target, run.data_cutoff, snapshot.latest_period
    `,
    [produkId],
  );

  return result.rows;
}

async function runInventoryForecast(db, produkIdInput, options = {}) {
  const produkId = parseProdukId(produkIdInput);
  const horizon = parseHorizon(options.horizon);

  const historyResult = await getInventoryHistory(db, produkId);
  if (historyResult.status === "product_not_found") {
    throw new InventoryForecastError(404, "Produk tidak ditemukan");
  }
  if (historyResult.status === "history_not_found") {
    throw new InventoryForecastError(404, "Produk tidak mempunyai histori persediaan bulanan");
  }

  const quality = await getProductQuality(db, produkId);
  if (!quality) throw new InventoryForecastError(404, "Produk tidak ditemukan");
  if (quality.latest_contiguous_observation_count < MIN_OBSERVATION_COUNT) {
    throw new InventoryForecastError(
      422,
      "Histori persediaan bulanan kontinu belum cukup untuk forecasting",
      {
        observation_count: quality.observation_count,
        latest_contiguous_observation_count: quality.latest_contiguous_observation_count,
        latest_contiguous_period_start: quality.latest_contiguous_period_start,
        latest_contiguous_period_end: quality.latest_contiguous_period_end,
        minimum_observation_count: MIN_OBSERVATION_COUNT,
        status: quality.status,
        messages: quality.messages,
      },
    );
  }

  const trainingHistory = selectForecastTrainingHistory(historyResult.data);
  const payload = buildWorkerPayload(produkId, trainingHistory, horizon);
  const workerResult = await callForecastWorker(payload, options);
  const forecast = validateWorkerResponse(workerResult, produkId);
  const saved = await saveForecastResults(db, produkId, trainingHistory, forecast);

  return {
    ...forecast,
    forecast_run_id: saved.forecast_run_id,
    data_cutoff: saved.data_cutoff,
    freshness: saved.status,
    forecast_result_ids: saved.forecast_result_ids,
    forecast_ranges: saved.forecast_ranges,
    quality: {
      observation_count: quality.observation_count,
      latest_contiguous_observation_count: quality.latest_contiguous_observation_count,
      training_period_start: trainingHistory.training_period_start,
      training_period_end: trainingHistory.training_period_end,
      missing_months: quality.missing_months,
      zero_ratio: quality.zero_ratio,
      eligible: quality.eligible,
      status: quality.status,
      messages: quality.messages,
    },
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner));
  return results;
}

async function runInventoryForecastBatch(db, options = {}) {
  const horizon = parseHorizon(options.horizon);
  const concurrency = parseBatchConcurrency(options.concurrency);
  const requestedProductIds = parseBatchProductIds(options.productIds || options.product_ids);
  const qualitySummary = await getQualitySummary(db, options.qualityOptions || {});
  const allowedIds = requestedProductIds ? new Set(requestedProductIds) : null;

  const products = qualitySummary.products.filter((product) => (
    product.eligible
    && product.is_active !== false
    && (!allowedIds || allowedIds.has(Number(product.produk_id)))
  ));

  if (products.length > MAX_BATCH_PRODUCTS) {
    throw new InventoryForecastError(
      400,
      `Jumlah produk eligible melebihi batas batch ${MAX_BATCH_PRODUCTS}`,
      { eligible_products: products.length },
    );
  }

  const startedAt = new Date().toISOString();
  const rows = await runWithConcurrency(products, concurrency, async (product) => {
    try {
      const forecast = await runInventoryForecast(db, product.produk_id, {
        ...options,
        horizon,
      });
      return {
        produk_id: Number(product.produk_id),
        nama_produk: product.nama_produk,
        status: "success",
        forecast_run_id: forecast.forecast_run_id,
        model_used: forecast.model_used,
        data_cutoff: forecast.data_cutoff,
        forecast_periods: forecast.forecast_periods,
      };
    } catch (error) {
      return {
        produk_id: Number(product.produk_id),
        nama_produk: product.nama_produk,
        status: "failed",
        status_code: error.statusCode || 500,
        message: error.message,
      };
    }
  });

  return {
    target: TARGET,
    frequency: FREQUENCY,
    horizon,
    concurrency,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    eligible_products: products.length,
    success_count: rows.filter((row) => row.status === "success").length,
    failed_count: rows.filter((row) => row.status === "failed").length,
    skipped_count: qualitySummary.products.length - products.length,
    results: rows,
  };
}

function buildLatestForecastResponse(product, run, rows, backtestRows = []) {
  if (!run || !rows || rows.length === 0) return null;

  return {
    produk: {
      id: Number(product.id),
      nama: product.nama_produk,
      stok_saat_ini: toNumberOrNull(product.stok),
      stok_minimum: toNumberOrNull(product.stok_minimum),
    },
    forecast_run_id: Number(run.id),
    product_id: Number(run.produk_id),
    target: run.target,
    frequency: run.frequency || FREQUENCY,
    model_used: run.model_used,
    data_cutoff: formatMonth(run.data_cutoff),
    freshness: run.status,
    forecast_periods: rows.map((row) => formatMonth(row.forecast_period)),
    forecast_values: rows.map((row) => toNumberOrNull(row.forecast_value)),
    forecast_ranges: rows.map((row) => ({
      period: formatMonth(row.forecast_period),
      lower_bound: toNumberOrNull(row.lower_bound),
      upper_bound: toNumberOrNull(row.upper_bound),
    })),
    evaluation: {
      mae: toNumberOrNull(run.mae),
      rmse: toNumberOrNull(run.rmse),
      wape: toNumberOrNull(run.wape),
      test_points: Number(run.test_points || 0),
    },
    candidate_models: safeJsonArray(run.candidate_models),
    backtest: backtestRows.map((row) => ({
      period: formatMonth(row.period),
      actual: toNumberOrNull(row.actual),
      predicted: toNumberOrNull(row.predicted),
      absolute_error: toNumberOrNull(row.absolute_error),
    })),
    realized_evaluation: rows.map((row) => ({
      period: formatMonth(row.forecast_period),
      actual: toNumberOrNull(row.actual_value),
      absolute_error: toNumberOrNull(row.absolute_error),
      absolute_percentage_error: toNumberOrNull(row.absolute_percentage_error),
      evaluated_at: row.evaluated_at || null,
    })),
    observation_count: Number(run.observation_count),
    warning: run.warning || null,
    created_at: run.created_at,
    updated_at: run.updated_at,
    forecast_result_ids: rows.map((row) => Number(row.id)),
  };
}

function getRiskLevel(forecastValue, stokMinimum) {
  const forecast = toNumberOrNull(forecastValue);
  const minimum = toNumberOrNull(stokMinimum);
  if (forecast === null || minimum === null) return "unknown";
  return forecast <= minimum ? "high" : "low";
}

function buildInventoryRiskRows(rows = []) {
  return rows.map((row) => ({
    produk_id: Number(row.produk_id),
    nama_produk: row.nama_produk,
    forecast_run_id: Number(row.forecast_run_id),
    forecast_period: formatMonth(row.forecast_period),
    forecast_value: toNumberOrNull(row.forecast_value),
    lower_bound: toNumberOrNull(row.lower_bound),
    upper_bound: toNumberOrNull(row.upper_bound),
    stok_minimum: toNumberOrNull(row.stok_minimum),
    risk: getRiskLevel(row.forecast_value, row.stok_minimum),
    model_used: row.model_used,
    data_cutoff: formatMonth(row.data_cutoff),
    freshness: row.status,
    created_at: row.created_at,
  }));
}

async function getInventoryRiskSummary(db) {
  await refreshForecastFreshness(db);
  const result = await db.query(
    `
      WITH latest_run AS (
        SELECT DISTINCT ON (run.produk_id)
          run.*
        FROM forecast_run run
        WHERE run.target=$1
          AND run.status IN ('current', 'stale')
        ORDER BY
          run.produk_id,
          CASE WHEN run.status='current' THEN 0 ELSE 1 END,
          run.created_at DESC,
          run.data_cutoff DESC,
          run.id DESC
      ),
      next_forecast AS (
        SELECT DISTINCT ON (run.produk_id)
          run.produk_id,
          run.id AS forecast_run_id,
          p.nama_produk,
          result.forecast_period,
          result.forecast_value,
          result.lower_bound,
          result.upper_bound,
          p.stok_minimum,
          run.model_used,
          run.data_cutoff,
          run.status,
          run.created_at
        FROM latest_run run
        JOIN forecast_result result ON result.forecast_run_id=run.id
        JOIN produk p ON p.id=run.produk_id
        WHERE result.forecast_period > run.data_cutoff
          AND p.deleted_at IS NULL
          AND p.is_active=TRUE
        ORDER BY run.produk_id, result.forecast_period ASC, result.id ASC
      )
      SELECT *
      FROM next_forecast
      ORDER BY
        CASE WHEN forecast_value <= stok_minimum THEN 0 ELSE 1 END,
        CASE WHEN status='stale' THEN 1 ELSE 0 END,
        forecast_period ASC,
        nama_produk ASC
    `,
    [TARGET],
  );

  return buildInventoryRiskRows(result.rows);
}

async function getLatestInventoryForecast(db, produkIdInput) {
  const produkId = parseProdukId(produkIdInput);
  await refreshForecastFreshness(db, produkId);

  const productResult = await db.query(
    "SELECT id, nama_produk, stok, stok_minimum FROM produk WHERE id=$1 AND deleted_at IS NULL",
    [produkId],
  );
  if (productResult.rows.length === 0) {
    throw new InventoryForecastError(404, "Produk tidak ditemukan");
  }

  const runResult = await db.query(
    `
      SELECT *
      FROM forecast_run
      WHERE produk_id=$1 AND target=$2 AND status IN ('current', 'stale')
      ORDER BY
        CASE WHEN status='current' THEN 0 ELSE 1 END,
        created_at DESC,
        data_cutoff DESC,
        id DESC
      LIMIT 1
    `,
    [produkId, TARGET],
  );

  if (runResult.rows.length === 0) {
    throw new InventoryForecastError(404, "Hasil forecast persediaan belum tersedia");
  }

  const run = runResult.rows[0];
  const [resultRows, backtestRows] = await Promise.all([
    db.query(
      "SELECT * FROM forecast_result WHERE forecast_run_id=$1 ORDER BY forecast_period ASC, id ASC",
      [run.id],
    ),
    db.query(
      "SELECT * FROM forecast_backtest WHERE forecast_run_id=$1 ORDER BY period ASC, id ASC",
      [run.id],
    ),
  ]);

  const response = buildLatestForecastResponse(
    productResult.rows[0],
    run,
    resultRows.rows,
    backtestRows.rows,
  );
  if (!response) {
    throw new InventoryForecastError(404, "Hasil forecast persediaan belum tersedia");
  }
  return response;
}

module.exports = {
  DEFAULT_BATCH_CONCURRENCY,
  FREQUENCY,
  InventoryForecastError,
  MAX_BATCH_CONCURRENCY,
  MIN_OBSERVATION_COUNT,
  TARGET,
  buildInventoryRiskRows,
  buildLatestForecastResponse,
  buildWorkerPayload,
  calculateIndicativeRange,
  callForecastWorker,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  getRiskLevel,
  parseBatchConcurrency,
  parseBatchProductIds,
  parseHorizon,
  refreshForecastFreshness,
  runInventoryForecast,
  runInventoryForecastBatch,
  selectForecastTrainingHistory,
  validateWorkerResponse,
};
