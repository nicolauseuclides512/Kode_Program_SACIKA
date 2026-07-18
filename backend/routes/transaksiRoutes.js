const express = require("express");
const router = express.Router();

const transaksiController = require("../controllers/transaksiController");

router.get("/", transaksiController.getTransaksi);
router.post("/", transaksiController.tambahTransaksi);
router.put("/:id", transaksiController.updateTransaksi);
router.delete("/:id", transaksiController.hapusTransaksi);

module.exports = router;
