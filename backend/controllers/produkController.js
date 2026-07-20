const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const { translateDatabaseError } = require("../utils/databaseErrors");
const { assertActiveCategory } = require("../services/categoryValidationService");
const {
  normalizeText,
  parseBoolean,
  parseIntegerId,
  parseMonthDate,
  parseNonNegativeDecimal,
} = require("../utils/validation");
const {
  paginatedResponse,
  parseBooleanQuery,
  parsePagination,
} = require("../utils/pagination");

function validateLifecycle(activeFrom, activeUntil) {
  if (activeFrom && activeUntil && activeUntil < activeFrom) {
    throw createHttpError(400, "active_until tidak boleh lebih awal dari active_from", {
      code: "INVALID_PRODUCT_LIFECYCLE",
    });
  }
}

function normalizeProductPayload(body = {}, current = {}) {
  const hasCurrent = Object.keys(current).length > 0;
  const namaProduk = normalizeText(
    body.nama_produk !== undefined ? body.nama_produk : current.nama_produk,
    "nama_produk",
    { maxLength: 255 },
  );
  const kategoriId = parseIntegerId(
    body.kategori_id !== undefined ? body.kategori_id : current.kategori_id,
    "kategori_id",
  );

  const activeFrom = parseMonthDate(
    body.active_from !== undefined ? body.active_from : current.active_from,
    "active_from",
  );
  const activeUntil = parseMonthDate(
    body.active_until !== undefined ? body.active_until : current.active_until,
    "active_until",
  );
  const isActive = parseBoolean(
    body.is_active,
    "is_active",
    current.is_active ?? true,
  );
  validateLifecycle(activeFrom, activeUntil);

  if (!isActive && !activeUntil) {
    throw createHttpError(400, "active_until wajib diisi ketika produk dinonaktifkan", {
      code: "PRODUCT_ACTIVE_UNTIL_REQUIRED",
    });
  }

  const rawCode = body.kode_produk !== undefined
    ? body.kode_produk
    : current.kode_produk;
  const kodeProduk = rawCode === undefined || rawCode === null || String(rawCode).trim() === ""
    ? null
    : normalizeText(rawCode, "kode_produk", { maxLength: 100 });

  return {
    kode_produk: kodeProduk,
    nama_produk: namaProduk,
    kategori_id: kategoriId,
    harga: parseNonNegativeDecimal(
      body.harga,
      "harga",
      { defaultValue: hasCurrent ? current.harga : 0 },
    ),
    stok: parseNonNegativeDecimal(
      body.stok,
      "stok",
      { defaultValue: hasCurrent ? current.stok : 0 },
    ),
    stok_minimum: parseNonNegativeDecimal(
      body.stok_minimum,
      "stok_minimum",
      { defaultValue: hasCurrent ? current.stok_minimum : 5 },
    ),
    is_active: isActive,
    active_from: activeFrom,
    active_until: activeUntil,
  };
}

function translateProductError(error) {
  return translateDatabaseError(error, {
    duplicateMessage: "Nama atau kode produk sudah digunakan",
    duplicateCode: "PRODUCT_CONFLICT",
    referenceMessage: "Produk tidak dapat diubah karena masih digunakan oleh transaksi atau histori",
    referenceCode: "PRODUCT_STILL_IN_USE",
    constraintMessage: "Data produk tidak memenuhi aturan sistem",
    constraintCode: "INVALID_PRODUCT_DATA",
  });
}

function buildProductFilters(req, params) {
  const clauses = [];
  const includeDeleted = req.user?.role === "admin"
    && parseBooleanQuery(req.query.include_deleted, false);
  const status = String(req.query.status || "active").toLowerCase();

  if (!includeDeleted) clauses.push("p.deleted_at IS NULL");
  if (!["active", "inactive", "all"].includes(status)) {
    throw createHttpError(400, "status produk harus active, inactive, atau all", {
      code: "INVALID_PRODUCT_FILTER_STATUS",
    });
  }
  if (status === "active") clauses.push("p.is_active=TRUE");
  if (status === "inactive") clauses.push("p.is_active=FALSE");

  if (req.query.kategori_id && req.query.kategori_id !== "semua") {
    const categoryId = parseIntegerId(req.query.kategori_id, "kategori_id");
    params.push(categoryId);
    clauses.push(`p.kategori_id=$${params.length}`);
  }

  const search = String(req.query.search || "").trim();
  if (search) {
    params.push(`%${search}%`);
    clauses.push(`(
      p.nama_produk ILIKE $${params.length}
      OR COALESCE(p.kode_produk, '') ILIKE $${params.length}
      OR k.nama_kategori ILIKE $${params.length}
    )`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

exports.getProduk = async (req, res, next) => {
  try {
    const all = parseBooleanQuery(req.query.all, false);
    const pagination = parsePagination(req.query, { defaultLimit: 25, maxLimit: 100 });
    const params = [];
    const where = buildProductFilters(req, params);
    const baseFrom = `
      FROM produk p
      LEFT JOIN kategori k ON p.kategori_id=k.id
      ${where}
    `;

    if (all) {
      const result = await db.query(
        `
          SELECT p.*, k.nama_kategori
          ${baseFrom}
          ORDER BY p.is_active DESC, p.nama_produk ASC
        `,
        params,
      );
      return res.json(result.rows);
    }

    const countResult = await db.query(`SELECT COUNT(*)::INTEGER AS total ${baseFrom}`, params);
    const dataParams = [...params, pagination.limit, pagination.offset];
    const result = await db.query(
      `
        SELECT p.*, k.nama_kategori
        ${baseFrom}
        ORDER BY p.is_active DESC, p.nama_produk ASC, p.id ASC
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
    return next(translateProductError(error));
  }
};

exports.getProdukById = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "produk_id");
    const includeDeleted = req.user?.role === "admin"
      && parseBooleanQuery(req.query.include_deleted, false);
    const result = await db.query(
      `
        SELECT p.*, k.nama_kategori
        FROM produk p
        LEFT JOIN kategori k ON p.kategori_id=k.id
        WHERE p.id=$1
          AND ($2::BOOLEAN OR p.deleted_at IS NULL)
      `,
      [id, includeDeleted],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Produk tidak ditemukan", {
        code: "PRODUCT_NOT_FOUND",
      });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(translateProductError(error));
  }
};

exports.tambahProduk = async (req, res, next) => {
  try {
    const payload = normalizeProductPayload(req.body);
    await assertActiveCategory(db, payload.kategori_id);
    const result = await db.query(
      `
        INSERT INTO produk (
          kode_produk, nama_produk, kategori_id, harga, stok, stok_minimum,
          is_active, active_from, active_until
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        payload.kode_produk,
        payload.nama_produk,
        payload.kategori_id,
        payload.harga,
        payload.stok,
        payload.stok_minimum,
        payload.is_active,
        payload.active_from,
        payload.active_until,
      ],
    );

    return res.status(201).json({
      message: "Produk berhasil ditambahkan",
      produk: result.rows[0],
    });
  } catch (error) {
    return next(translateProductError(error));
  }
};

exports.updateProduk = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "produk_id");
    const currentResult = await db.query(
      "SELECT * FROM produk WHERE id=$1 AND deleted_at IS NULL",
      [id],
    );

    if (currentResult.rows.length === 0) {
      throw createHttpError(404, "Produk tidak ditemukan", {
        code: "PRODUCT_NOT_FOUND",
      });
    }

    const payload = normalizeProductPayload(req.body, currentResult.rows[0]);
    await assertActiveCategory(db, payload.kategori_id);

    const result = await db.query(
      `
        UPDATE produk
        SET kode_produk=$1,
            nama_produk=$2,
            kategori_id=$3,
            harga=$4,
            stok=$5,
            stok_minimum=$6,
            is_active=$7,
            active_from=$8,
            active_until=$9
        WHERE id=$10 AND deleted_at IS NULL
        RETURNING *
      `,
      [
        payload.kode_produk,
        payload.nama_produk,
        payload.kategori_id,
        payload.harga,
        payload.stok,
        payload.stok_minimum,
        payload.is_active,
        payload.active_from,
        payload.active_until,
        id,
      ],
    );

    return res.json({
      message: "Produk berhasil diperbarui",
      produk: result.rows[0],
    });
  } catch (error) {
    return next(translateProductError(error));
  }
};

exports.deleteProduk = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "produk_id");
    const result = await db.query(
      `
        UPDATE produk
        SET deleted_at=NOW(),
            is_active=FALSE,
            active_until=COALESCE(active_until, DATE_TRUNC('month', CURRENT_DATE)::DATE)
        WHERE id=$1 AND deleted_at IS NULL
        RETURNING id, deleted_at
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Produk tidak ditemukan", {
        code: "PRODUCT_NOT_FOUND",
      });
    }

    return res.json({
      message: "Produk berhasil dinonaktifkan dan diarsipkan",
      produk: result.rows[0],
    });
  } catch (error) {
    return next(translateProductError(error));
  }
};

exports.restoreProduk = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "produk_id");
    const result = await db.query(
      `
        UPDATE produk
        SET deleted_at=NULL,
            is_active=TRUE,
            active_until=NULL
        WHERE id=$1 AND deleted_at IS NOT NULL
        RETURNING *
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Produk arsip tidak ditemukan", {
        code: "ARCHIVED_PRODUCT_NOT_FOUND",
      });
    }

    return res.json({
      message: "Produk berhasil dipulihkan",
      produk: result.rows[0],
    });
  } catch (error) {
    return next(translateProductError(error));
  }
};

module.exports.normalizeProductPayload = normalizeProductPayload;
module.exports.parseMonthDate = parseMonthDate;
