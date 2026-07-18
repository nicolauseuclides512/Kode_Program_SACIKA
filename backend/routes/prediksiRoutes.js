const express = require("express");

const router = express.Router();

const prediksiController = require("../controllers/prediksiController");

const validateProdukId = (req, res, next) => {
  const id = Number(req.params.produk_id);

  if (!id || isNaN(id) || id <= 0) {
    return res.status(400).json({
      message: "produk_id harus angka valid",
    });
  }

  req.params.produk_id = id;

  next();
};

const normalizeQuery = (req, res, next) => {
  let { minggu } = req.query;

  minggu = Number(minggu) || 1;

  if (![1, 4, 12].includes(minggu)) {
    minggu = 1;
  }

  req.query.minggu = minggu;

  next();
};

const validatePeriode = (req, res, next) => {
  const { minggu } = req.query;

  if (![1, 4, 12].includes(Number(minggu))) {
    return res.status(400).json({
      message: "Periode hanya 1, 4, atau 12 minggu",
    });
  }

  next();
};

router.get(
  "/dataset/:produk_id",
  validateProdukId,
  prediksiController.getDataset,
);

router.get(
  "/chart/:produk_id",
  validateProdukId,
  normalizeQuery,
  validatePeriode,
  prediksiController.chart,
);

router.get(
  "/:produk_id",
  validateProdukId,
  normalizeQuery,
  validatePeriode,
  prediksiController.prediksi,
);

module.exports = router;
