const express = require("express");
const transaksiController = require("../controllers/transaksiController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken, allowRoles("admin", "staff"));

router.get("/", transaksiController.getTransaksi);
router.post("/", transaksiController.tambahTransaksi);
router.put("/:id", transaksiController.updateTransaksi);
router.delete("/:id", transaksiController.hapusTransaksi);

module.exports = router;
