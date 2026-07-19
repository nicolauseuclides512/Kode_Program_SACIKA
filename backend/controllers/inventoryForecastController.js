const {
  InventoryForecastError,
  getInventoryRiskSummary,
  getLatestInventoryForecast,
  runInventoryForecast,
} = require("../services/inventoryForecastService");
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
