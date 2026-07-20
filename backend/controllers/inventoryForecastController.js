const {
  InventoryForecastError,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  runInventoryForecast,
  runInventoryForecastBatch,
} = require("../services/inventoryForecastService");
const {
  ForecastActualEvaluationError,
  evaluateForecastsAgainstActuals,
} = require("../services/forecastActualEvaluationService");
const {
  SalesForecastReadinessError,
  getMonthlySalesForecastReadiness,
} = require("../services/salesForecastReadinessService");

function getDefaultDatabase() {
  return require("../config/database");
}

function sendError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    message: error.message || fallbackMessage,
    ...(error.details ? { details: error.details } : {}),
  });
}

function createInventoryForecastController(database = getDefaultDatabase(), options = {}) {
  return {
    async getInventoryRiskSummary(req, res) {
      try {
        const riskSummary = await getInventoryRiskSummary(database);
        return res.json(riskSummary);
      } catch (error) {
        return sendError(
          res,
          error instanceof InventoryForecastError
            ? error
            : new InventoryForecastError(500, "Gagal mengambil ringkasan risiko prediksi", error.message),
          "Error fetching inventory forecast risk:",
        );
      }
    },

    async createInventoryForecast(req, res) {
      try {
        const forecast = await runInventoryForecast(
          database,
          req.params.produk_id,
          {
            ...options,
            horizon: req.body?.horizon ?? req.query?.horizon,
          },
        );

        return res.json(forecast);
      } catch (error) {
        return sendError(
          res,
          error instanceof InventoryForecastError
            ? error
            : new InventoryForecastError(500, "Gagal membuat forecast persediaan", error.message),
          "Error creating inventory forecast:",
        );
      }
    },

    async getLatestInventoryForecast(req, res) {
      try {
        const forecast = await getLatestInventoryForecast(database, req.params.produk_id);
        return res.json(forecast);
      } catch (error) {
        return sendError(
          res,
          error instanceof InventoryForecastError
            ? error
            : new InventoryForecastError(500, "Gagal mengambil forecast persediaan terbaru", error.message),
          "Error fetching latest inventory forecast:",
        );
      }
    },

    async createInventoryForecastBatch(req, res) {
      try {
        const result = await runInventoryForecastBatch(database, {
          ...options,
          horizon: req.body?.horizon ?? req.query?.horizon,
          concurrency: req.body?.concurrency ?? req.query?.concurrency,
          productIds: req.body?.product_ids ?? req.query?.product_ids,
        });
        return res.json(result);
      } catch (error) {
        return sendError(
          res,
          error instanceof InventoryForecastError
            ? error
            : new InventoryForecastError(500, "Gagal menjalankan batch forecast", error.message),
          "Error running batch inventory forecast:",
        );
      }
    },

    async evaluateInventoryForecasts(req, res) {
      try {
        const result = await evaluateForecastsAgainstActuals(database, {
          period: req.body?.period ?? req.query?.period,
          recalculate: req.body?.recalculate === true || req.query?.recalculate === "true",
        });
        return res.json(result);
      } catch (error) {
        return sendError(
          res,
          error instanceof ForecastActualEvaluationError
            ? error
            : new ForecastActualEvaluationError(500, "Gagal mengevaluasi forecast terhadap data aktual", error.message),
          "Error evaluating inventory forecasts:",
        );
      }
    },

    async getSalesForecastReadiness(req, res) {
      try {
        const readiness = await getMonthlySalesForecastReadiness(database, req.params.produk_id);
        return res.json(readiness);
      } catch (error) {
        return sendError(
          res,
          error instanceof SalesForecastReadinessError
            ? error
            : new SalesForecastReadinessError(500, "Gagal mengambil status kesiapan prediksi penjualan", error.message),
          "Error fetching sales forecast readiness:",
        );
      }
    },
  };
}

module.exports = {
  createInventoryForecastController,
};
