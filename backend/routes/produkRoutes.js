const express = require("express");
const produkController = require("../controllers/produkController");
const { allowRoles, verifyToken } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(verifyToken);

router.get("/", allowRoles("admin", "staff"), produkController.getProduk);
router.get("/:id", allowRoles("admin", "staff"), produkController.getProdukById);
router.post("/", allowRoles("admin"), produkController.tambahProduk);
router.put("/:id", allowRoles("admin"), produkController.updateProduk);
router.delete("/:id", allowRoles("admin"), produkController.deleteProduk);

module.exports = router;
