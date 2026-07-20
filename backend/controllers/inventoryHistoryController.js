const {
  getInventoryHistory: getInventoryHistoryService,
  getProductQuality: getProductQualityService,
  getQualitySummary: getQualitySummaryService,
  parsePeriodParam,
} = require("../services/inventoryHistoryQualityService");
const { createHttpError } = require("../utils/httpError");

function parseQualityOptions(query = {}) {
  const options = {};

  if (query.start_period) {
    options.startPeriod = parsePeriodParam(query.start_period, "start_period");
  }

  if (query.end_period) {
    options.endPeriod = parsePeriodParam(query.end_period, "end_period");
  }

  if (options.startPeriod && options.endPeriod && options.startPeriod > options.endPeriod) {
    throw createHttpError(400, "start_period tidak boleh lebih besar dari end_period", {
      code: "INVALID_PERIOD_RANGE",
    });
  }

  if (query.window_months !== undefined && query.window_months !== "") {
    const windowMonths = Number(query.window_months);
    if (!Number.isInteger(windowMonths) || windowMonths <= 0 || windowMonths > 120) {
      throw createHttpError(400, "window_months harus integer antara 1 dan 120", {
        code: "INVALID_WINDOW_MONTHS",
      });
    }
    options.windowMonths = windowMonths;
  }

  return options;
}

function getDefaultDatabase() {
  return require("../config/database");
}

function mapHistoryInputError(error) {
  if (error.statusCode) return error;
  if (/(period|window_months)/i.test(error.message)) {
    return createHttpError(400, error.message, {
      code: "INVALID_HISTORY_QUERY",
      cause: error,
    });
  }
  return error;
}

function createInventoryHistoryController(database = getDefaultDatabase()) {
  return {
    async getInventoryHistory(req, res, next) {
      const produkId = Number(req.params.produk_id);

      if (!Number.isInteger(produkId) || produkId <= 0) {
        return res.status(400).json({ message: "produk_id harus angka valid" });
      }

      try {
        const result = await getInventoryHistoryService(database, produkId, req.query);

        if (result.status === "product_not_found") {
          return res.status(404).json({ message: "Produk tidak ditemukan" });
        }

        if (result.status === "history_not_found") {
          return res.status(404).json({ message: "Produk tidak mempunyai histori persediaan bulanan" });
        }

        return res.json(result.data);
      } catch (error) {
        return next(mapHistoryInputError(error));
      }
    },

    async getProductQuality(req, res, next) {
      const produkId = Number(req.params.produk_id);

      if (!Number.isInteger(produkId) || produkId <= 0) {
        return res.status(400).json({ message: "produk_id harus angka valid" });
      }

      try {
        const quality = await getProductQualityService(
          database,
          produkId,
          parseQualityOptions(req.query),
        );

        if (!quality) {
          return res.status(404).json({ message: "Produk tidak ditemukan" });
        }

        return res.json(quality);
      } catch (error) {
        return next(mapHistoryInputError(error));
      }
    },

    async getQualitySummary(req, res, next) {
      try {
        const summary = await getQualitySummaryService(
          database,
          parseQualityOptions(req.query),
        );
        return res.json(summary);
      } catch (error) {
        return next(mapHistoryInputError(error));
      }
    },
  };
}

module.exports = {
  createInventoryHistoryController,
  parseQualityOptions,
};
