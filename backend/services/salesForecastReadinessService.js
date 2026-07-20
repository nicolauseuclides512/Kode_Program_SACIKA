const { FORECAST_TARGETS } = require("./forecastTargets");
const {
  MonthlySalesHistoryError,
  getMonthlySalesHistory,
} = require("./monthlySalesHistoryService");

class SalesForecastReadinessError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function classifyMonthlySalesReadiness(observationCount) {
  const count = Number(observationCount) || 0;
  if (count < 6) return { status: "insufficient_data", message: "Histori transaksi keluar bulanan belum mencukupi." };
  if (count < 12) return { status: "experimental", message: "Histori tersedia untuk eksplorasi, tetapi belum cukup untuk pratinjau model." };
  if (count < 24) return { status: "eligible_basic", message: "Histori cukup untuk pratinjau forecasting dasar oleh administrator." };
  return { status: "eligible_full", message: "Histori cukup untuk evaluasi forecasting yang lebih lengkap." };
}

function buildMonthlySalesReadinessResponse(observationCount, details = {}) {
  const readiness = classifyMonthlySalesReadiness(observationCount);
  return {
    target: FORECAST_TARGETS.MONTHLY_SALES,
    source: "actual_outgoing_transactions",
    observation_count: Number(observationCount) || 0,
    minimum_preview_observations: 12,
    status: readiness.status,
    preview_enabled: Number(observationCount) >= 12,
    message: readiness.message,
    ...details,
  };
}

async function getMonthlySalesForecastReadiness(db, produkIdInput, options = {}) {
  try {
    const history = await getMonthlySalesHistory(db, produkIdInput, options);
    return buildMonthlySalesReadinessResponse(history.observation_count, {
      period_start: history.period_start || null,
      period_end: history.period_end || null,
      complete_through: history.complete_through || null,
      zero_month_count: history.zero_month_count || 0,
      history_status: history.status,
    });
  } catch (error) {
    if (error instanceof MonthlySalesHistoryError) {
      throw new SalesForecastReadinessError(error.statusCode, error.message, error.details);
    }
    throw error;
  }
}

module.exports = {
  SalesForecastReadinessError,
  buildMonthlySalesReadinessResponse,
  classifyMonthlySalesReadiness,
  getMonthlySalesForecastReadiness,
};
