const {
  getProductQuality: getProductQualityService,
  getQualitySummary: getQualitySummaryService,
} = require("../services/inventoryHistoryQualityService");

function getDefaultDatabase() {
  return require("../config/database");
}

function createInventoryHistoryController(database = getDefaultDatabase()) {
  return {
    async getProductQuality(req, res) {
      const produkId = Number(req.params.produk_id);

      if (!produkId || Number.isNaN(produkId) || produkId <= 0) {
        return res.status(400).json({ message: "produk_id harus angka valid" });
      }

      try {
        const quality = await getProductQualityService(database, produkId);

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
        const summary = await getQualitySummaryService(database);
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
};
