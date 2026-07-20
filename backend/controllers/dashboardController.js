const db = require("../config/database");
const { getDashboardSummary } = require("../services/dashboardService");

exports.getSummary = async (req, res, next) => {
  try {
    const result = await getDashboardSummary(db, req.query.period);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
};
