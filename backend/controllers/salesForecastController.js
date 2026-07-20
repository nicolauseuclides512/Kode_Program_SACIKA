const db = require("../config/database");
const {
  MonthlySalesHistoryError,
  getMonthlySalesHistory,
} = require("../services/monthlySalesHistoryService");
const {
  SalesForecastReadinessError,
  getMonthlySalesForecastReadiness,
} = require("../services/salesForecastReadinessService");
const {
  SalesForecastError,
  runMonthlySalesForecastPreview,
} = require("../services/salesForecastService");

function sendKnownError(res, next, error) {
  if (Number(error.statusCode) >= 500 || !error.statusCode) return next(error);
  return res.status(error.statusCode).json({
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

exports.history = async (req, res, next) => {
  try {
    const result = await getMonthlySalesHistory(db, req.params.produk_id, {
      includeCurrentMonth: req.query.include_current_month === "true",
      endPeriod: req.query.end_period,
    });
    return res.json(result);
  } catch (error) {
    const normalized = error instanceof MonthlySalesHistoryError
      ? error
      : new MonthlySalesHistoryError(500, "Gagal mengambil histori transaksi keluar bulanan");
    return sendKnownError(res, next, normalized);
  }
};

exports.readiness = async (req, res, next) => {
  try {
    const result = await getMonthlySalesForecastReadiness(db, req.params.produk_id);
    return res.json(result);
  } catch (error) {
    const normalized = error instanceof SalesForecastReadinessError
      ? error
      : new SalesForecastReadinessError(500, "Gagal mengambil kesiapan forecasting penjualan");
    return sendKnownError(res, next, normalized);
  }
};

exports.preview = async (req, res, next) => {
  try {
    const result = await runMonthlySalesForecastPreview(db, req.params.produk_id, {
      horizon: req.body?.horizon ?? req.query?.horizon,
    });
    return res.json(result);
  } catch (error) {
    const normalized = error instanceof SalesForecastError
      ? error
      : new SalesForecastError(500, "Gagal membuat pratinjau forecasting penjualan");
    return sendKnownError(res, next, normalized);
  }
};
