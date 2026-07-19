const db = require("../config/database");
const { runSalesAggregation } = require("../services/salesAggregationService");

exports.aggregate = async (req, res) => {
  try {
    const result = await runSalesAggregation(db);
    return res.json(result);
  } catch (error) {
    console.error("[ERROR] Sales aggregation:", error);
    return res.status(500).json({
      message: "Gagal menjalankan agregasi penjualan",
      error: error.message,
    });
  }
};
