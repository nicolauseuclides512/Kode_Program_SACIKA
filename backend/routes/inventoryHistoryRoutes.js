const express = require("express");
const {
  createInventoryHistoryController,
} = require("../controllers/inventoryHistoryController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
const inventoryHistoryController = createInventoryHistoryController();

router.use(verifyToken, allowRoles("admin", "staff"));

router.get("/quality/summary", inventoryHistoryController.getQualitySummary);
router.get("/:produk_id/quality", inventoryHistoryController.getProductQuality);
router.get("/:produk_id", inventoryHistoryController.getInventoryHistory);

module.exports = router;
