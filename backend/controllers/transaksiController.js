const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const { translateDatabaseError } = require("../utils/databaseErrors");
const { parseIntegerId, parseIsoDate } = require("../utils/validation");
const { paginatedResponse, parsePagination } = require("../utils/pagination");
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

  return next(translateDatabaseError(error, {
    referenceMessage: "Transaksi tidak dapat diproses karena produk tidak tersedia atau data masih digunakan",
    referenceCode: "TRANSACTION_REFERENCE_CONFLICT",
    constraintMessage: "Data transaksi tidak memenuhi aturan sistem",
    constraintCode: "INVALID_TRANSACTION_DATA",
  }));
}

function buildTransactionFilters(query, params) {
  const clauses = ["p.deleted_at IS NULL"];
  const jenis = query.jenis || query.jenis_transaksi;
  if (jenis && jenis !== "semua") {
    if (!["masuk", "keluar"].includes(jenis)) {
      throw createHttpError(400, "jenis transaksi harus masuk, keluar, atau semua", {
        code: "INVALID_TRANSACTION_TYPE",
      });
    }
    params.push(jenis);
    clauses.push(`t.jenis_transaksi=$${params.length}`);
  }

  if (query.produk_id) {
    const productId = parseIntegerId(query.produk_id, "produk_id");
    params.push(productId);
    clauses.push(`t.produk_id=$${params.length}`);
  }

  const startDate = query.start_date
    ? parseIsoDate(query.start_date, "start_date")
    : null;
  const endDate = query.end_date
    ? parseIsoDate(query.end_date, "end_date")
    : null;

  if (startDate && endDate && endDate < startDate) {
    throw createHttpError(400, "end_date tidak boleh lebih awal dari start_date", {
      code: "INVALID_TRANSACTION_DATE_RANGE",
    });
  }

  if (startDate) {
    params.push(startDate);
    clauses.push(`t.tanggal >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    clauses.push(`t.tanggal <= $${params.length}`);
  }

  const search = String(query.search || "").trim();
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`p.nama_produk ILIKE $${params.length}`);
  }

  return `WHERE ${clauses.join(" AND ")}`;
}

exports.getTransaksi = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const params = [];
    const where = buildTransactionFilters(req.query, params);
    const from = `
      FROM transaksi t
      JOIN produk p ON t.produk_id=p.id
      ${where}
    `;

    const countResult = await db.query(`SELECT COUNT(*)::INTEGER AS total ${from}`, params);
    const dataParams = [...params, pagination.limit, pagination.offset];
    const result = await db.query(
      `
        SELECT t.*, p.nama_produk
        ${from}
        ORDER BY t.tanggal DESC, t.id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams,
    );

    return res.json(paginatedResponse(result.rows, {
      ...pagination,
      total: countResult.rows[0].total,
    }));
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

module.exports.buildTransactionFilters = buildTransactionFilters;
