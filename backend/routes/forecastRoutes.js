const express = require("express");
const {
  createInventoryForecastController,
} = require("../controllers/inventoryForecastController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
const inventoryForecastController = createInventoryForecastController();

router.use(verifyToken, allowRoles("admin", "staff"));

router.get("/inventory-risk", inventoryForecastController.getInventoryRiskSummary);
router.get(
  "/sales/:produk_id/readiness",
  inventoryForecastController.getSalesForecastReadiness,
);
router.post(
  "/inventory/batch",
  allowRoles("admin"),
  inventoryForecastController.createInventoryForecastBatch,
);
router.post(
  "/inventory/evaluate-actuals",
  allowRoles("admin"),
  inventoryForecastController.evaluateInventoryForecasts,
);
router.post(
  "/inventory/:produk_id",
  inventoryForecastController.createInventoryForecast,
);
router.get(
  "/inventory/:produk_id/latest",
  inventoryForecastController.getLatestInventoryForecast,
);

module.exports = router;
