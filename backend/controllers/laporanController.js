const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const { paginatedResponse, parsePagination } = require("../utils/pagination");

function validateTransactionType(value) {
  if (!value || value === "semua") return null;
  if (!["masuk", "keluar"].includes(value)) {
    throw createHttpError(400, "jenis_transaksi harus masuk, keluar, atau semua", {
      code: "INVALID_TRANSACTION_TYPE",
    });
  }
  return value;
}

function buildReportFilters(queryInput = {}) {
  const { start_date, end_date, kategori_id } = queryInput;
  const transactionType = validateTransactionType(queryInput.jenis_transaksi);
  const clauses = ["p.deleted_at IS NULL"];
  const params = [];

  if (start_date) {
    params.push(start_date);
    clauses.push(`t.tanggal >= $${params.length}`);
  }
  if (end_date) {
    params.push(end_date);
    clauses.push(`t.tanggal <= $${params.length}`);
  }
  if (transactionType) {
    params.push(transactionType);
    clauses.push(`t.jenis_transaksi=$${params.length}`);
  }
  if (kategori_id && kategori_id !== "semua") {
    const categoryId = Number(kategori_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw createHttpError(400, "kategori_id tidak valid", {
        code: "INVALID_CATEGORY_ID",
      });
    }
    params.push(categoryId);
    clauses.push(`p.kategori_id=$${params.length}`);
  }

  const search = String(queryInput.search || "").trim();
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(
      p.nama_produk ILIKE $${params.length}
      OR k.nama_kategori ILIKE $${params.length}
    )`);
  }

  return {
    params,
    where: `WHERE ${clauses.join(" AND ")}`,
  };
}

exports.getLaporan = async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const { params, where } = buildReportFilters(req.query);
    const from = `
      FROM transaksi t
      JOIN produk p ON t.produk_id=p.id
      LEFT JOIN kategori k ON p.kategori_id=k.id
      ${where}
    `;

    const summaryResult = await db.query(
      `
        SELECT
          COUNT(*)::INTEGER AS transaction_count,
          COALESCE(SUM(t.jumlah), 0)::NUMERIC AS total_quantity,
          COALESCE(SUM(t.total), 0)::NUMERIC AS total_value,
          COALESCE(SUM(t.jumlah) FILTER (WHERE t.jenis_transaksi='masuk'), 0)::NUMERIC AS incoming_quantity,
          COALESCE(SUM(t.jumlah) FILTER (WHERE t.jenis_transaksi='keluar'), 0)::NUMERIC AS outgoing_quantity,
          COALESCE(SUM(t.total) FILTER (WHERE t.jenis_transaksi='masuk'), 0)::NUMERIC AS incoming_value,
          COALESCE(SUM(t.total) FILTER (WHERE t.jenis_transaksi='keluar'), 0)::NUMERIC AS outgoing_value
        ${from}
      `,
      params,
    );

    const dataParams = [...params, pagination.limit, pagination.offset];
    const result = await db.query(
      `
        SELECT
          t.id,
          t.tanggal,
          t.jenis_transaksi,
          t.jumlah,
          t.harga,
          t.total,
          p.nama_produk,
          k.nama_kategori
        ${from}
        ORDER BY t.tanggal DESC, t.id DESC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      dataParams,
    );

    const summary = summaryResult.rows[0];
    return res.json(paginatedResponse(result.rows, {
      ...pagination,
      total: summary.transaction_count,
    }, {
      summary: {
        transaction_count: Number(summary.transaction_count),
        total_quantity: Number(summary.total_quantity),
        total_value: Number(summary.total_value),
        incoming_quantity: Number(summary.incoming_quantity),
        outgoing_quantity: Number(summary.outgoing_quantity),
        incoming_value: Number(summary.incoming_value),
        outgoing_value: Number(summary.outgoing_value),
      },
    }));
  } catch (error) {
    return next(error);
  }
};

module.exports.buildReportFilters = buildReportFilters;
module.exports.validateTransactionType = validateTransactionType;
