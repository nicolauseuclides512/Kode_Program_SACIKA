const express = require("express");
const datasetController = require("../controllers/datasetController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));
router.post("/aggregate", datasetController.aggregate);

module.exports = router;
