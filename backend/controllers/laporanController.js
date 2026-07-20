const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");

function validateTransactionType(value) {
  if (!value || value === "semua") return null;
  if (!["masuk", "keluar"].includes(value)) {
    throw createHttpError(400, "jenis_transaksi harus masuk, keluar, atau semua", {
      code: "INVALID_TRANSACTION_TYPE",
    });
  }
  return value;
}

exports.getLaporan = async (req, res, next) => {
  try {
    const { start_date, end_date, kategori_id } = req.query;
    const transactionType = validateTransactionType(req.query.jenis_transaksi);

    let query = `
      SELECT
        t.id,
        t.tanggal,
        t.jenis_transaksi,
        t.jumlah,
        t.harga,
        t.total,
        p.nama_produk,
        k.nama_kategori
      FROM transaksi t
      LEFT JOIN produk p ON t.produk_id = p.id
      LEFT JOIN kategori k ON p.kategori_id = k.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      params.push(start_date);
      query += ` AND t.tanggal >= $${params.length}`;
    }

    if (end_date) {
      params.push(end_date);
      query += ` AND t.tanggal <= $${params.length}`;
    }

    if (transactionType) {
      params.push(transactionType);
      query += ` AND t.jenis_transaksi = $${params.length}`;
    }

    if (kategori_id && kategori_id !== "semua") {
      const categoryId = Number(kategori_id);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        throw createHttpError(400, "kategori_id tidak valid", {
          code: "INVALID_CATEGORY_ID",
        });
      }
      params.push(categoryId);
      query += ` AND p.kategori_id = $${params.length}`;
    }

    query += " ORDER BY t.tanggal DESC, t.id DESC";
    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
};
