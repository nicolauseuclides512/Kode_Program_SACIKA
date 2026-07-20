const express = require("express");
const controller = require("../controllers/salesForecastController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(verifyToken, allowRoles("admin", "staff"));
router.get("/:produk_id/history", controller.history);
router.get("/:produk_id/readiness", controller.readiness);
router.post("/:produk_id/preview", allowRoles("admin"), controller.preview);

module.exports = router;
