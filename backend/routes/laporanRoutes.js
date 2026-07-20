const express = require("express");
const laporanController = require("../controllers/laporanController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken, allowRoles("admin", "staff"));
router.get("/", laporanController.getLaporan);

module.exports = router;
