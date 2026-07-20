const db = require("../config/database");
const { runMonthlySalesAggregation } = require("../services/salesAggregationService");

exports.aggregateMonthly = async (req, res, next) => {
  try {
    const result = await runMonthlySalesAggregation(db);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
