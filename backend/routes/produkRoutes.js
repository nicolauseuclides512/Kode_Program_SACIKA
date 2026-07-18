const express = require("express");
const router = express.Router();

const produkController = require("../controllers/produkController");

router.get("/", produkController.getProduk);

router.get("/:id", produkController.getProdukById);

router.post("/", produkController.tambahProduk);

router.put("/:id", produkController.updateProduk);

router.delete("/:id", produkController.deleteProduk);

module.exports = router;
