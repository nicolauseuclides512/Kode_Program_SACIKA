const db = require("../config/database");
const { runSalesAggregation } = require("../services/salesAggregationService");

const LEGACY_SUNSET = "Thu, 31 Dec 2026 23:59:59 GMT";

function setDeprecationHeaders(res) {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", LEGACY_SUNSET);
  res.setHeader("Warning", '299 - "Endpoint agregasi mingguan legacy; gunakan /api/sales/aggregate"');
  res.setHeader("Link", '</api/sales/aggregate>; rel="successor-version"');
}

exports.aggregate = async (req, res, next) => {
  try {
    setDeprecationHeaders(res);
    const result = await runSalesAggregation(db);
    return res.json({
      ...result,
      deprecated: true,
      replacement_endpoint: "/api/sales/aggregate",
      legacy_table: "dataset_mingguan",
      note: "Agregasi mingguan dipertahankan hanya untuk kompatibilitas kode lama.",
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  LEGACY_SUNSET,
  setDeprecationHeaders,
  aggregate: exports.aggregate,
};
