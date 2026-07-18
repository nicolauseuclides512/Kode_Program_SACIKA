const express = require("express");
const router = express.Router();

const laporanController = require("../controllers/laporanController");

router.get("/", laporanController.getLaporan);

module.exports = router;
