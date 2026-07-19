const express = require("express");

const {
  createInventoryForecastController,
} = require("../controllers/inventoryForecastController");

const router = express.Router();
const inventoryForecastController = createInventoryForecastController();

router.get("/inventory-risk", inventoryForecastController.getInventoryRiskSummary);
router.post("/inventory/:produk_id", inventoryForecastController.createInventoryForecast);
router.get("/inventory/:produk_id/latest", inventoryForecastController.getLatestInventoryForecast);

module.exports = router;
