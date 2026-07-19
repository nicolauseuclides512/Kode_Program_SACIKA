const axios = require("axios");

const {
  getInventoryHistory,
  getProductQuality,
} = require("./inventoryHistoryQualityService");
const { FORECAST_TARGETS } = require("./forecastTargets");

const TARGET = FORECAST_TARGETS.ENDING_INVENTORY;
const FREQUENCY = "monthly";
const MIN_OBSERVATION_COUNT = 18;
const DEFAULT_WORKER_URL = "http://localhost:5000";
const DEFAULT_WORKER_TIMEOUT_MS = 10000;

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
  if (!produkId || Number.isNaN(produkId) || produkId <= 0) {
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

function monthToDate(period, fieldName = "periode") {
  const text = String(period || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})$/);

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

  const text = String(value);
  return text.includes("T") ? text.slice(0, 7) : text.slice(0, 7);
}

function toNumberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildWorkerPayload(produkId, history, horizon = 1) {
  return {
    product_id: produkId,
    target: TARGET,
    frequency: FREQUENCY,
    periods: history.periods,
    values: history.values,
    horizon,
  };
}

function validateWorkerResponse(workerResult, produkId) {
  const errors = [];

  if (!workerResult || typeof workerResult !== "object" || Array.isArray(workerResult)) {
    throw new InventoryForecastError(502, "Response worker tidak valid");
  }

  if (Number(workerResult.product_id) !== produkId) {
    errors.push("product_id worker tidak sesuai");
  }

  if (workerResult.target !== TARGET) {
    errors.push("target worker harus ending_inventory");
  }

  if (workerResult.frequency !== FREQUENCY) {
    errors.push("frequency worker harus monthly");
  }

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
    for (const period of workerResult.forecast_periods) {
      monthToDate(period, "forecast_period");
    }
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
  };
}

async function callForecastWorker(payload, options = {}) {
  const httpClient = options.httpClient || axios;
  const workerUrl = (options.workerUrl || getWorkerUrl()).replace(/\/+$/, "");
  const timeout = options.timeoutMs || getWorkerTimeoutMs();

  try {
    const response = await httpClient.post(`${workerUrl}/predict`, payload, { timeout });
    return response.data;
  } catch (error) {
    if (!error.response) {
      throw new InventoryForecastError(
        503,
        "Worker forecasting tidak aktif atau timeout",
        {
          code: error.code || null,
          message: error.message,
        },
      );
    }

    const workerStatus = Number(error.response.status);
    const statusCode = workerStatus === 422 ? 422 : 502;
    const message = workerStatus === 422
      ? "Worker forecasting belum dapat memilih model"
      : "Worker forecasting gagal memproses request";

    throw new InventoryForecastError(statusCode, message, {
      status: error.response.status,
      data: error.response.data,
    });
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

async function saveForecastResults(db, produkId, history, workerResult) {
  const dataCutoff = getDataCutoff(history);
  const evaluation = workerResult.evaluation || {};
  const warning = warningToText(workerResult.warning);

  return withTransaction(db, async (client) => {
    const savedRows = [];

    for (let index = 0; index < workerResult.forecast_periods.length; index += 1) {
      const forecastPeriod = monthToDate(workerResult.forecast_periods[index], "forecast_period");
      const forecastValue = Number(workerResult.forecast_values[index]);

      const result = await client.query(
        `
          INSERT INTO forecast_result (
            produk_id,
            target,
            model_used,
            data_cutoff,
            forecast_period,
            forecast_value,
            mae,
            rmse,
            wape,
            observation_count,
            warning
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (produk_id, data_cutoff, forecast_period, model_used)
          DO UPDATE SET
            target = EXCLUDED.target,
            forecast_value = EXCLUDED.forecast_value,
            mae = EXCLUDED.mae,
            rmse = EXCLUDED.rmse,
            wape = EXCLUDED.wape,
            observation_count = EXCLUDED.observation_count,
            warning = EXCLUDED.warning,
            created_at = NOW()
          RETURNING id, forecast_period, created_at
        `,
        [
          produkId,
          TARGET,
          workerResult.model_used,
          dataCutoff,
          forecastPeriod,
          forecastValue,
          toNumberOrNull(evaluation.mae),
          toNumberOrNull(evaluation.rmse),
          toNumberOrNull(evaluation.wape),
          history.observation_count,
          warning,
        ],
      );

      savedRows.push(result.rows[0]);
    }

    return {
      data_cutoff: formatMonth(dataCutoff),
      forecast_result_ids: savedRows.map((row) => Number(row.id)),
    };
  });
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
  if (!quality) {
    throw new InventoryForecastError(404, "Produk tidak ditemukan");
  }

  if (quality.observation_count < MIN_OBSERVATION_COUNT) {
    throw new InventoryForecastError(
      422,
      "Histori persediaan bulanan belum cukup untuk forecasting",
      {
        observation_count: quality.observation_count,
        minimum_observation_count: MIN_OBSERVATION_COUNT,
        status: quality.status,
        messages: quality.messages,
      },
    );
  }

  const payload = buildWorkerPayload(produkId, historyResult.data, horizon);
  const workerResult = await callForecastWorker(payload, options);
  const forecast = validateWorkerResponse(workerResult, produkId);
  const saved = await saveForecastResults(db, produkId, historyResult.data, forecast);

  return {
    ...forecast,
    data_cutoff: saved.data_cutoff,
    forecast_result_ids: saved.forecast_result_ids,
    quality: {
      observation_count: quality.observation_count,
      missing_months: quality.missing_months,
      zero_ratio: quality.zero_ratio,
      eligible: quality.eligible,
      status: quality.status,
      messages: quality.messages,
    },
  };
}

function buildLatestForecastResponse(product, rows) {
  if (!rows || rows.length === 0) return null;

  const first = rows[0];

  return {
    produk: {
      id: Number(product.id),
      nama: product.nama_produk,
      stok_saat_ini: toNumberOrNull(product.stok),
      stok_minimum: toNumberOrNull(product.stok_minimum),
    },
    product_id: Number(first.produk_id),
    target: first.target,
    frequency: FREQUENCY,
    model_used: first.model_used,
    data_cutoff: formatMonth(first.data_cutoff),
    forecast_periods: rows.map((row) => formatMonth(row.forecast_period)),
    forecast_values: rows.map((row) => toNumberOrNull(row.forecast_value)),
    evaluation: {
      mae: toNumberOrNull(first.mae),
      rmse: toNumberOrNull(first.rmse),
      wape: toNumberOrNull(first.wape),
      test_points: null,
    },
    observation_count: Number(first.observation_count),
    warning: first.warning || null,
    created_at: first.created_at,
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
    forecast_period: formatMonth(row.forecast_period),
    forecast_value: toNumberOrNull(row.forecast_value),
    stok_minimum: toNumberOrNull(row.stok_minimum),
    risk: getRiskLevel(row.forecast_value, row.stok_minimum),
    model_used: row.model_used,
  }));
}

async function getInventoryRiskSummary(db) {
  const result = await db.query(
    `
      WITH latest_run AS (
        SELECT DISTINCT ON (fr.produk_id)
          fr.produk_id,
          fr.target,
          fr.data_cutoff,
          fr.model_used,
          fr.created_at
        FROM forecast_result fr
        WHERE fr.target=$1
          AND fr.forecast_value IS NOT NULL
          AND fr.forecast_value >= 0
          AND BTRIM(fr.model_used) <> ''
        ORDER BY fr.produk_id, fr.created_at DESC, fr.data_cutoff DESC, fr.id DESC
      ),
      next_forecast AS (
        SELECT DISTINCT ON (fr.produk_id)
          fr.produk_id,
          p.nama_produk,
          fr.forecast_period,
          fr.forecast_value,
          p.stok_minimum,
          fr.model_used
        FROM forecast_result fr
        JOIN latest_run lr
          ON lr.produk_id = fr.produk_id
         AND lr.target = fr.target
         AND lr.data_cutoff = fr.data_cutoff
         AND lr.model_used = fr.model_used
         AND lr.created_at = fr.created_at
        JOIN produk p ON p.id = fr.produk_id
        WHERE fr.forecast_period > fr.data_cutoff
          AND fr.forecast_value IS NOT NULL
          AND fr.forecast_value >= 0
        ORDER BY fr.produk_id, fr.forecast_period ASC, fr.id ASC
      )
      SELECT *
      FROM next_forecast
      ORDER BY
        CASE
          WHEN forecast_value <= stok_minimum THEN 0
          ELSE 1
        END,
        forecast_period ASC,
        nama_produk ASC
    `,
    [TARGET],
  );

  return buildInventoryRiskRows(result.rows);
}

async function getLatestInventoryForecast(db, produkIdInput) {
  const produkId = parseProdukId(produkIdInput);

  const productResult = await db.query(
    `
      SELECT id, nama_produk, stok, stok_minimum
      FROM produk
      WHERE id=$1
    `,
    [produkId],
  );

  if (productResult.rows.length === 0) {
    throw new InventoryForecastError(404, "Produk tidak ditemukan");
  }

  const latestResult = await db.query(
    `
      WITH latest AS (
        SELECT produk_id, target, data_cutoff, model_used, created_at
        FROM forecast_result
        WHERE produk_id=$1 AND target=$2
        ORDER BY created_at DESC, forecast_period DESC, id DESC
        LIMIT 1
      )
      SELECT fr.*
      FROM forecast_result fr
      JOIN latest l
        ON l.produk_id = fr.produk_id
       AND l.target = fr.target
       AND l.data_cutoff = fr.data_cutoff
       AND l.model_used = fr.model_used
       AND l.created_at = fr.created_at
      ORDER BY fr.forecast_period ASC, fr.id ASC
    `,
    [produkId, TARGET],
  );

  const response = buildLatestForecastResponse(productResult.rows[0], latestResult.rows);
  if (!response) {
    throw new InventoryForecastError(404, "Hasil forecast persediaan belum tersedia");
  }

  return response;
}

module.exports = {
  FREQUENCY,
  InventoryForecastError,
  MIN_OBSERVATION_COUNT,
  TARGET,
  buildInventoryRiskRows,
  buildLatestForecastResponse,
  buildWorkerPayload,
  callForecastWorker,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  getRiskLevel,
  parseHorizon,
  runInventoryForecast,
  validateWorkerResponse,
};
