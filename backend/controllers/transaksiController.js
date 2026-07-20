const db = require("../config/database");
const {
  StockTransactionError,
  createStockTransaction,
  deleteStockTransaction,
  updateStockTransaction,
} = require("../services/stockTransactionService");

function sendStockTransactionError(res, next, error) {
  if (error instanceof StockTransactionError && error.statusCode < 500) {
    return res.status(error.statusCode).json({
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  return next(error);
}

exports.getTransaksi = async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        transaksi.*,
        produk.nama_produk
      FROM transaksi
      LEFT JOIN produk ON transaksi.produk_id = produk.id
      ORDER BY transaksi.tanggal DESC, transaksi.id DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
};

exports.tambahTransaksi = async (req, res, next) => {
  try {
    const result = await createStockTransaction(db, req.body);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, next, error);
  }
};

exports.updateTransaksi = async (req, res, next) => {
  try {
    const result = await updateStockTransaction(db, req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, next, error);
  }
};

exports.hapusTransaksi = async (req, res, next) => {
  try {
    const result = await deleteStockTransaction(db, req.params.id);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, next, error);
  }
};
