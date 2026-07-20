const express = require("express");
const controller = require("../controllers/salesAggregationController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(verifyToken, allowRoles("admin"));
router.post("/aggregate", controller.aggregateMonthly);

module.exports = router;
