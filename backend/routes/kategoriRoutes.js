const express = require("express");
const kategoriController = require("../controllers/kategoriController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken);

router.get("/", allowRoles("admin", "staff"), kategoriController.getKategori);
router.post("/", allowRoles("admin"), kategoriController.tambahKategori);
router.put("/:id", allowRoles("admin"), kategoriController.updateKategori);
router.delete("/:id", allowRoles("admin"), kategoriController.deleteKategori);
router.patch("/:id/restore", allowRoles("admin"), kategoriController.restoreKategori);

module.exports = router;
