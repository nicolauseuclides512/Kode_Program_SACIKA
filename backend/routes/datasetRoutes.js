const express = require("express");
const router = express.Router();
const datasetController = require("../controllers/datasetController");

router.post("/aggregate", datasetController.aggregate);

module.exports = router;
