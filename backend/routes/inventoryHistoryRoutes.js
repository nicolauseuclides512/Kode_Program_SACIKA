const express = require("express");
const router = express.Router();

const {
  createInventoryHistoryController,
} = require("../controllers/inventoryHistoryController");

const inventoryHistoryController = createInventoryHistoryController();

router.get("/quality/summary", inventoryHistoryController.getQualitySummary);
router.get("/:produk_id/quality", inventoryHistoryController.getProductQuality);

module.exports = router;
