const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const {
  paginatedResponse,
  parseBooleanQuery,
  parsePagination,
} = require("../utils/pagination");

function parseNonNegativeNumber(value, fieldName, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createHttpError(400, `${fieldName} harus berupa angka nol atau positif`, {
      code: `INVALID_${fieldName.toUpperCase()}`,
    });
  }

  return parsed;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;

  throw createHttpError(400, "is_active harus berupa boolean", {
    code: "INVALID_PRODUCT_STATUS",
  });
}

function parseMonthDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-01)?$/);

  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw createHttpError(400, `${fieldName} harus berformat YYYY-MM atau YYYY-MM-01`, {
      code: "INVALID_MONTH_DATE",
    });
  }

  return `${match[1]}-${match[2]}-01`;
}

function validateLifecycle(activeFrom, activeUntil) {
  if (activeFrom && activeUntil && activeUntil < activeFrom) {
    throw createHttpError(400, "active_until tidak boleh lebih awal dari active_from", {
      code: "INVALID_PRODUCT_LIFECYCLE",
    });
  }
}

function normalizeProductPayload(body = {}, current = {}) {
  const namaProduk = String(body.nama_produk ?? current.nama_produk ?? "").trim();
  const kategoriId = Number(body.kategori_id ?? current.kategori_id);

  if (!namaProduk) {
    throw createHttpError(400, "nama_produk wajib diisi", {
      code: "PRODUCT_NAME_REQUIRED",
    });
  }

  if (!Number.isInteger(kategoriId) || kategoriId <= 0) {
    throw createHttpError(400, "kategori_id harus berupa ID kategori yang valid", {
      code: "INVALID_CATEGORY_ID",
    });
  }

  const activeFrom = parseMonthDate(
    body.active_from !== undefined ? body.active_from : current.active_from,
    "active_from",
  );
  const activeUntil = parseMonthDate(
    body.active_until !== undefined ? body.active_until : current.active_until,
    "active_until",
  );
  const isActive = parseBoolean(body.is_active, current.is_active ?? true);
  validateLifecycle(activeFrom, activeUntil);

  if (!isActive && !activeUntil) {
    throw createHttpError(400, "active_until wajib diisi ketika produk dinonaktifkan", {
      code: "PRODUCT_ACTIVE_UNTIL_REQUIRED",
    });
  }

  return {
    kode_produk: body.kode_produk !== undefined
      ? (String(body.kode_produk || "").trim() || null)
      : (current.kode_produk || null),
    nama_produk: namaProduk,
    kategori_id: kategoriId,
    harga: parseNonNegativeNumber(body.harga, "harga", Number(current.harga ?? 0)),
    stok: parseNonNegativeNumber(body.stok, "stok", Number(current.stok ?? 0)),
    stok_minimum: parseNonNegativeNumber(
      body.stok_minimum,
      "stok_minimum",
      Number(current.stok_minimum ?? 5),
    ),
    is_active: isActive,
    active_from: activeFrom,
    active_until: activeUntil,
  };
}

function translateProductError(error) {
  if (error.statusCode) return error;

  if (error.code === "23505") {
    return createHttpError(409, "Nama atau kode produk sudah digunakan", {
      code: "PRODUCT_CONFLICT",
      cause: error,
    });
  }

  if (error.code === "23503") {
    return createHttpError(409, "Kategori produk tidak ditemukan atau data produk masih digunakan", {
      code: "PRODUCT_REFERENCE_CONFLICT",
      cause: error,
    });
  }

  return error;
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
    const categoryId = Number(req.query.kategori_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw createHttpError(400, "kategori_id tidak valid", {
        code: "INVALID_CATEGORY_ID",
      });
    }
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
      [req.params.id, includeDeleted],
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
    const result = await db.query(
      `
        INSERT INTO produk (
          kode_produk, nama_produk, kategori_id, harga, stok, stok_minimum,
          is_active, active_from, active_until
        )
        SELECT $1, $2, k.id, $4, $5, $6, $7, $8, $9
        FROM kategori k
        WHERE k.id=$3 AND k.deleted_at IS NULL AND k.is_active=TRUE
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

    if (result.rows.length === 0) {
      throw createHttpError(400, "Kategori aktif tidak ditemukan", {
        code: "ACTIVE_CATEGORY_NOT_FOUND",
      });
    }

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
    const currentResult = await db.query(
      "SELECT * FROM produk WHERE id=$1 AND deleted_at IS NULL",
      [req.params.id],
    );

    if (currentResult.rows.length === 0) {
      throw createHttpError(404, "Produk tidak ditemukan", {
        code: "PRODUCT_NOT_FOUND",
      });
    }

    const payload = normalizeProductPayload(req.body, currentResult.rows[0]);
    const categoryResult = await db.query(
      "SELECT id FROM kategori WHERE id=$1 AND deleted_at IS NULL AND is_active=TRUE",
      [payload.kategori_id],
    );
    if (categoryResult.rows.length === 0) {
      throw createHttpError(400, "Kategori aktif tidak ditemukan", {
        code: "ACTIVE_CATEGORY_NOT_FOUND",
      });
    }

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
        req.params.id,
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
    const result = await db.query(
      `
        UPDATE produk
        SET deleted_at=NOW(),
            is_active=FALSE,
            active_until=COALESCE(active_until, DATE_TRUNC('month', CURRENT_DATE)::DATE)
        WHERE id=$1 AND deleted_at IS NULL
        RETURNING id, deleted_at
      `,
      [req.params.id],
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
    const result = await db.query(
      `
        UPDATE produk
        SET deleted_at=NULL,
            is_active=TRUE,
            active_until=NULL
        WHERE id=$1 AND deleted_at IS NOT NULL
        RETURNING *
      `,
      [req.params.id],
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
