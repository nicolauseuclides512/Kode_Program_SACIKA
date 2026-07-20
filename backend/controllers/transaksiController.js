const db = require("../config/database");
const {
  StockTransactionError,
  createStockTransaction,
  deleteStockTransaction,
  updateStockTransaction,
} = require("../services/stockTransactionService");

function sendStockTransactionError(res, error, operation) {
  const statusCode = error instanceof StockTransactionError
    ? error.statusCode
    : 500;

  if (statusCode >= 500) {
    console.error(`Error ${operation} transaksi:`, error);
  }

  return res.status(statusCode).json({
    message: error.message || "Database error",
    ...(error.details ? { details: error.details } : {}),
  });
}

exports.getTransaksi = (req, res) => {
  const query = `
    SELECT
      transaksi.*,
      produk.nama_produk
    FROM transaksi
    LEFT JOIN produk ON transaksi.produk_id = produk.id
    ORDER BY transaksi.tanggal DESC, transaksi.id DESC
  `;

  db.query(query, (err, result) => {
    if (err) {
      console.error("Error fetching transaksi:", err);
      return res.status(500).json({ message: "Gagal mengambil transaksi" });
    }

    return res.json(result.rows);
  });
};

exports.tambahTransaksi = async (req, res) => {
  try {
    const result = await createStockTransaction(db, req.body);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, error, "creating");
  }
};

exports.updateTransaksi = async (req, res) => {
  try {
    const result = await updateStockTransaction(db, req.params.id, req.body);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, error, "updating");
  }
};

exports.hapusTransaksi = async (req, res) => {
  try {
    const result = await deleteStockTransaction(db, req.params.id);
    return res.json(result);
  } catch (error) {
    return sendStockTransactionError(res, error, "deleting");
  }
};
