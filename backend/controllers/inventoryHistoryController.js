const {
  getInventoryHistory: getInventoryHistoryService,
  getProductQuality: getProductQualityService,
  getQualitySummary: getQualitySummaryService,
  parsePeriodParam,
} = require("../services/inventoryHistoryQualityService");


function parseQualityOptions(query = {}) {
  const options = {};

  if (query.start_period) {
    options.startPeriod = parsePeriodParam(query.start_period, "start_period");
  }

  if (query.end_period) {
    options.endPeriod = parsePeriodParam(query.end_period, "end_period");
  }

  if (options.startPeriod && options.endPeriod && options.startPeriod > options.endPeriod) {
    throw new Error("start_period tidak boleh lebih besar dari end_period");
  }

  if (query.window_months !== undefined && query.window_months !== "") {
    const windowMonths = Number(query.window_months);
    if (!Number.isInteger(windowMonths) || windowMonths <= 0 || windowMonths > 120) {
      throw new Error("window_months harus integer antara 1 dan 120");
    }
    options.windowMonths = windowMonths;
  }

  return options;
}

function getDefaultDatabase() {
  return require("../config/database");
}

function createInventoryHistoryController(database = getDefaultDatabase()) {
  return {
    async getInventoryHistory(req, res) {
      const produkId = Number(req.params.produk_id);

      if (!produkId || Number.isNaN(produkId) || produkId <= 0) {
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
        const statusCode = /(period|window_months)/i.test(error.message) ? 400 : 500;

        console.error("Error fetching inventory history:", error);
        return res.status(statusCode).json({
          message: statusCode === 400
            ? error.message
            : "Gagal mengambil histori persediaan bulanan",
          error: error.message,
        });
      }
    },

    async getProductQuality(req, res) {
      const produkId = Number(req.params.produk_id);

      if (!produkId || Number.isNaN(produkId) || produkId <= 0) {
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
        console.error("Error fetching inventory quality:", error);
        return res.status(500).json({
          message: "Gagal mengambil kualitas histori persediaan",
          error: error.message,
        });
      }
    },

    async getQualitySummary(req, res) {
      try {
        const summary = await getQualitySummaryService(
          database,
          parseQualityOptions(req.query),
        );
        return res.json(summary);
      } catch (error) {
        console.error("Error fetching inventory quality summary:", error);
        return res.status(500).json({
          message: "Gagal mengambil ringkasan kualitas histori persediaan",
          error: error.message,
        });
      }
    },
  };
}

module.exports = {
  createInventoryHistoryController,
  parseQualityOptions,
};
