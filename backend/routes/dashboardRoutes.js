const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(verifyToken, allowRoles("admin", "staff"));
router.get("/summary", dashboardController.getSummary);

module.exports = router;
