const db = require("../config/database");
const { runSalesAggregation } = require("../services/salesAggregationService");

exports.aggregate = async (req, res, next) => {
  try {
    const result = await runSalesAggregation(db);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
