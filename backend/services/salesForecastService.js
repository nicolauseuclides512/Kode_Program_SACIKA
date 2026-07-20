const {
  callForecastWorker,
  calculateIndicativeRange,
} = require("./inventoryForecastService");
const {
  MonthlySalesHistoryError,
  getMonthlySalesHistory,
  parseProdukId,
} = require("./monthlySalesHistoryService");
const { FORECAST_TARGETS } = require("./forecastTargets");

const TARGET = FORECAST_TARGETS.MONTHLY_SALES;
const FREQUENCY = "monthly";
const MIN_OBSERVATIONS = 12;

class SalesForecastError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function parseHorizon(value) {
  if (value === undefined || value === null || value === "") return 1;
  const horizon = Number(value);
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 3) {
    throw new SalesForecastError(400, "horizon harus integer antara 1 dan 3");
  }
  return horizon;
}

function monthToDate(period, fieldName = "periode") {
  const match = String(period || "").match(/^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/);
  if (!match) throw new SalesForecastError(502, `${fieldName} harus berformat YYYY-MM`);
  return `${match[1]}-${match[2]}-01`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function validateSalesWorkerResponse(result, productId) {
  const errors = [];
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new SalesForecastError(502, "Response worker tidak valid");
  }
  if (Number(result.product_id) !== productId) errors.push("product_id worker tidak sesuai");
  if (result.target !== TARGET) errors.push("target worker harus monthly_sales");
  if (result.frequency !== FREQUENCY) errors.push("frequency worker harus monthly");
  if (!result.model_used) errors.push("model_used wajib tersedia");
  if (!Array.isArray(result.forecast_periods) || result.forecast_periods.length === 0) {
    errors.push("forecast_periods wajib berupa array tidak kosong");
  }
  if (!Array.isArray(result.forecast_values) || result.forecast_values.length === 0) {
    errors.push("forecast_values wajib berupa array tidak kosong");
  }
  if ((result.forecast_periods || []).length !== (result.forecast_values || []).length) {
    errors.push("panjang forecast_periods dan forecast_values harus sama");
  }
  for (const period of result.forecast_periods || []) monthToDate(period, "forecast_period");
  for (const value of result.forecast_values || []) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      errors.push("forecast_values harus numerik non-negatif");
      break;
    }
  }
  if (errors.length > 0) {
    throw new SalesForecastError(502, "Response worker penjualan tidak valid", errors);
  }
  return {
    ...result,
    product_id: productId,
    target: TARGET,
    frequency: FREQUENCY,
    forecast_values: result.forecast_values.map(Number),
    candidate_models: Array.isArray(result.candidate_models) ? result.candidate_models : [],
    backtest: Array.isArray(result.backtest) ? result.backtest : [],
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Error awal tetap menjadi error utama.
  }
}

async function saveSalesForecastPreview(db, productId, history, forecast) {
  const client = await db.connect();
  const cutoff = monthToDate(history.periods[history.periods.length - 1], "data_cutoff");
  const evaluation = forecast.evaluation || {};
  const mae = toNumberOrNull(evaluation.mae);

  try {
    await client.query("BEGIN");
    await client.query(
      `
        UPDATE forecast_run
        SET status='superseded', updated_at=NOW()
        WHERE produk_id=$1 AND target=$2 AND status IN ('current', 'stale')
      `,
      [productId, TARGET],
    );

    const runResult = await client.query(
      `
        INSERT INTO forecast_run (
          produk_id, target, frequency, model_used, data_cutoff,
          mae, rmse, wape, test_points, observation_count,
          candidate_models, warning, status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,'current')
        ON CONFLICT (produk_id, target, data_cutoff, model_used)
        DO UPDATE SET
          mae=EXCLUDED.mae,
          rmse=EXCLUDED.rmse,
          wape=EXCLUDED.wape,
          test_points=EXCLUDED.test_points,
          observation_count=EXCLUDED.observation_count,
          candidate_models=EXCLUDED.candidate_models,
          warning=EXCLUDED.warning,
          status='current',
          updated_at=NOW()
        RETURNING id, created_at
      `,
      [
        productId,
        TARGET,
        FREQUENCY,
        forecast.model_used,
        cutoff,
        mae,
        toNumberOrNull(evaluation.rmse),
        toNumberOrNull(evaluation.wape),
        Number(evaluation.test_points || 0),
        history.observation_count,
        JSON.stringify(forecast.candidate_models),
        ["EXPERIMENTAL_PREVIEW", ...(Array.isArray(forecast.warning) ? forecast.warning : forecast.warning ? [forecast.warning] : [])].join("; "),
      ],
    );

    const runId = Number(runResult.rows[0].id);
    await client.query("DELETE FROM forecast_result WHERE forecast_run_id=$1", [runId]);
    await client.query("DELETE FROM forecast_backtest WHERE forecast_run_id=$1", [runId]);

    const ranges = [];
    for (let index = 0; index < forecast.forecast_periods.length; index += 1) {
      const period = monthToDate(forecast.forecast_periods[index], "forecast_period");
      const value = Number(forecast.forecast_values[index]);
      const range = calculateIndicativeRange(value, mae);
      await client.query(
        `
          INSERT INTO forecast_result (
            forecast_run_id, forecast_period, forecast_value, lower_bound, upper_bound
          ) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (forecast_run_id, forecast_period)
          DO UPDATE SET
            forecast_value=EXCLUDED.forecast_value,
            lower_bound=EXCLUDED.lower_bound,
            upper_bound=EXCLUDED.upper_bound,
            created_at=NOW()
        `,
        [runId, period, value, range.lower_bound, range.upper_bound],
      );
      ranges.push({ period: forecast.forecast_periods[index], ...range });
    }

    for (const row of forecast.backtest) {
      const actual = toNumberOrNull(row.actual);
      const predicted = toNumberOrNull(row.predicted);
      if (actual === null || predicted === null) continue;
      await client.query(
        `
          INSERT INTO forecast_backtest (
            forecast_run_id, period, actual, predicted, absolute_error
          ) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (forecast_run_id, period)
          DO UPDATE SET
            actual=EXCLUDED.actual,
            predicted=EXCLUDED.predicted,
            absolute_error=EXCLUDED.absolute_error
        `,
        [runId, monthToDate(row.period, "backtest.period"), actual, predicted, Math.abs(actual - predicted)],
      );
    }

    await client.query("COMMIT");
    return {
      forecast_run_id: runId,
      data_cutoff: cutoff.slice(0, 7),
      forecast_ranges: ranges,
      created_at: runResult.rows[0].created_at,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function runMonthlySalesForecastPreview(db, produkIdInput, options = {}) {
  let productId;
  try {
    productId = parseProdukId(produkIdInput);
  } catch (error) {
    if (error instanceof MonthlySalesHistoryError) {
      throw new SalesForecastError(error.statusCode, error.message, error.details);
    }
    throw error;
  }
  const horizon = parseHorizon(options.horizon);
  const history = await getMonthlySalesHistory(db, productId, options.historyOptions || {});

  if (history.observation_count < MIN_OBSERVATIONS) {
    throw new SalesForecastError(
      422,
      "Histori transaksi keluar bulanan belum cukup untuk pratinjau forecasting",
      {
        observation_count: history.observation_count,
        minimum_observation_count: MIN_OBSERVATIONS,
        period_start: history.period_start || null,
        period_end: history.period_end || null,
      },
    );
  }

  const payload = {
    product_id: productId,
    target: TARGET,
    frequency: FREQUENCY,
    periods: history.periods,
    values: history.values,
    horizon,
  };
  let workerRaw;
  try {
    workerRaw = await callForecastWorker(payload, options);
  } catch (error) {
    if (Number.isInteger(Number(error?.statusCode))) {
      throw new SalesForecastError(
        Number(error.statusCode),
        error.message || "Worker forecasting penjualan gagal diproses",
        error.details || null,
      );
    }
    throw error;
  }

  const forecast = validateSalesWorkerResponse(workerRaw, productId);
  const saved = await saveSalesForecastPreview(db, productId, history, forecast);

  return {
    ...forecast,
    ...saved,
    experimental: true,
    source: "actual_outgoing_transactions",
    history: {
      observation_count: history.observation_count,
      period_start: history.period_start,
      period_end: history.period_end,
      zero_month_count: history.zero_month_count,
      current_month_excluded: history.current_month_excluded,
    },
    usage_notice: {
      interpretation: "monthly_outgoing_transaction_estimate",
      operational_feature: false,
      procurement_recommendation: false,
      message: "Pratinjau ini untuk evaluasi metodologis dan belum menjadi dasar otomatis pengadaan.",
    },
  };
}

module.exports = {
  FREQUENCY,
  MIN_OBSERVATIONS,
  SalesForecastError,
  TARGET,
  parseHorizon,
  runMonthlySalesForecastPreview,
  saveSalesForecastPreview,
  validateSalesWorkerResponse,
};
