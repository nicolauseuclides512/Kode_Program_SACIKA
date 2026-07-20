class ForecastActualEvaluationError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function parsePeriod(value) {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})(?:-01)?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new ForecastActualEvaluationError(400, "period harus berformat YYYY-MM");
  }
  return `${match[1]}-${match[2]}-01`;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildEvaluationMetrics(forecastValue, actualValue) {
  const forecast = toNumberOrNull(forecastValue);
  const actual = toNumberOrNull(actualValue);

  if (forecast === null || actual === null || forecast < 0 || actual < 0) {
    throw new ForecastActualEvaluationError(422, "Nilai forecast dan aktual harus numerik non-negatif");
  }

  const signedError = actual - forecast;
  const absoluteError = Math.abs(signedError);
  const squaredError = signedError ** 2;
  const absolutePercentageError = actual === 0
    ? null
    : (absoluteError / Math.abs(actual)) * 100;

  return {
    actual_value: actual,
    signed_error: signedError,
    absolute_error: absoluteError,
    squared_error: squaredError,
    absolute_percentage_error: absolutePercentageError,
  };
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch (error) {
    console.error("Rollback evaluasi forecast gagal:", error.message);
  }
}

async function evaluateForecastsAgainstActuals(db, options = {}) {
  const period = parsePeriod(options.period);
  const onlyPending = options.recalculate !== true;
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const candidateResult = await client.query(
      `
        SELECT
          result.id AS forecast_result_id,
          result.forecast_value,
          result.actual_value AS previous_actual_value,
          result.evaluated_at AS previous_evaluated_at,
          result.forecast_period,
          run.id AS forecast_run_id,
          run.produk_id,
          run.target,
          snapshot.stok_akhir AS actual_value
        FROM forecast_result result
        JOIN forecast_run run ON run.id=result.forecast_run_id
        JOIN inventory_snapshot_monthly snapshot
          ON snapshot.produk_id=run.produk_id
         AND snapshot.periode=result.forecast_period
         AND snapshot.status_data IN ('observed', 'corrected')
        WHERE run.target='ending_inventory'
          AND ($1::date IS NULL OR result.forecast_period=$1)
          AND ($2::boolean = FALSE OR result.actual_value IS NULL)
        ORDER BY result.forecast_period, run.produk_id, result.id
        FOR UPDATE OF result
      `,
      [period, onlyPending],
    );

    const rows = [];
    for (const candidate of candidateResult.rows) {
      const metrics = buildEvaluationMetrics(
        candidate.forecast_value,
        candidate.actual_value,
      );

      await client.query(
        `
          UPDATE forecast_result
          SET
            actual_value=$2,
            absolute_error=$3,
            squared_error=$4,
            absolute_percentage_error=$5,
            evaluated_at=NOW()
          WHERE id=$1
        `,
        [
          candidate.forecast_result_id,
          metrics.actual_value,
          metrics.absolute_error,
          metrics.squared_error,
          metrics.absolute_percentage_error,
        ],
      );

      rows.push({
        forecast_result_id: Number(candidate.forecast_result_id),
        forecast_run_id: Number(candidate.forecast_run_id),
        produk_id: Number(candidate.produk_id),
        target: candidate.target,
        forecast_period: String(candidate.forecast_period).slice(0, 7),
        forecast_value: toNumberOrNull(candidate.forecast_value),
        ...metrics,
      });
    }

    await client.query("COMMIT");

    const absoluteErrors = rows.map((row) => row.absolute_error);
    const squaredErrors = rows.map((row) => row.squared_error);
    const actualTotal = rows.reduce((sum, row) => sum + row.actual_value, 0);
    const absoluteErrorTotal = absoluteErrors.reduce((sum, value) => sum + value, 0);

    return {
      mode: onlyPending ? "pending-only" : "recalculate",
      period: period ? period.slice(0, 7) : null,
      evaluated_count: rows.length,
      metrics: {
        mae: absoluteErrors.length > 0
          ? absoluteErrors.reduce((sum, value) => sum + value, 0) / absoluteErrors.length
          : null,
        rmse: squaredErrors.length > 0
          ? Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / squaredErrors.length)
          : null,
        wape: actualTotal > 0
          ? (absoluteErrorTotal / actualTotal) * 100
          : null,
      },
      rows,
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ForecastActualEvaluationError,
  buildEvaluationMetrics,
  evaluateForecastsAgainstActuals,
  parsePeriod,
};
