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

function getDefaultDatabase() {
  return require("../config/database");
}

function sendKnownError(res, next, error) {
  const statusCode = Number(error.statusCode || 500);
  if (statusCode >= 500) return next(error);

  return res.status(statusCode).json({
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

function createInventoryForecastController(database = getDefaultDatabase(), options = {}) {
  return {
    async getInventoryRiskSummary(req, res, next) {
      try {
        const riskSummary = await getInventoryRiskSummary(database);
        return res.json(riskSummary);
      } catch (error) {
        return sendKnownError(res, next, error);
      }
    },

    async createInventoryForecast(req, res, next) {
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
        const normalized = error instanceof InventoryForecastError
          ? error
          : new InventoryForecastError(500, "Gagal membuat forecast persediaan");
        if (!(error instanceof InventoryForecastError)) normalized.cause = error;
        return sendKnownError(res, next, normalized);
      }
    },

    async getLatestInventoryForecast(req, res, next) {
      try {
        const forecast = await getLatestInventoryForecast(database, req.params.produk_id);
        return res.json(forecast);
      } catch (error) {
        return sendKnownError(res, next, error);
      }
    },

    async createInventoryForecastBatch(req, res, next) {
      try {
        const result = await runInventoryForecastBatch(database, {
          ...options,
          horizon: req.body?.horizon ?? req.query?.horizon,
          concurrency: req.body?.concurrency ?? req.query?.concurrency,
          productIds: req.body?.product_ids ?? req.query?.product_ids,
        });
        return res.json(result);
      } catch (error) {
        return sendKnownError(res, next, error);
      }
    },

    async evaluateInventoryForecasts(req, res, next) {
      try {
        const result = await evaluateForecastsAgainstActuals(database, {
          period: req.body?.period ?? req.query?.period,
          recalculate: req.body?.recalculate === true || req.query?.recalculate === "true",
        });
        return res.json(result);
      } catch (error) {
        const normalized = error instanceof ForecastActualEvaluationError
          ? error
          : new ForecastActualEvaluationError(
            500,
            "Gagal mengevaluasi forecast terhadap data aktual",
          );
        if (!(error instanceof ForecastActualEvaluationError)) normalized.cause = error;
        return sendKnownError(res, next, normalized);
      }
    },

  };
}

module.exports = {
  createInventoryForecastController,
};
