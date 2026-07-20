const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");

function parseNonNegativeNumber(value, fieldName, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    const error = new Error(`${fieldName} harus berupa angka nol atau positif`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;

  const error = new Error("is_active harus berupa boolean");
  error.statusCode = 400;
  throw error;
}

function parseMonthDate(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-01)?$/);

  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    const error = new Error(`${fieldName} harus berformat YYYY-MM atau YYYY-MM-01`);
    error.statusCode = 400;
    throw error;
  }

  return `${match[1]}-${match[2]}-01`;
}

function validateLifecycle(activeFrom, activeUntil) {
  if (activeFrom && activeUntil && activeUntil < activeFrom) {
    const error = new Error("active_until tidak boleh lebih awal dari active_from");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeProductPayload(body = {}, current = {}) {
  const namaProduk = String(body.nama_produk ?? current.nama_produk ?? "").trim();
  const kategoriId = Number(body.kategori_id ?? current.kategori_id);

  if (!namaProduk) {
    const error = new Error("nama_produk wajib diisi");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(kategoriId) || kategoriId <= 0) {
    const error = new Error("kategori_id harus berupa ID kategori yang valid");
    error.statusCode = 400;
    throw error;
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
    const error = new Error("active_until wajib diisi ketika produk dinonaktifkan");
    error.statusCode = 400;
    throw error;
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

exports.getProduk = async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT
        produk.*,
        kategori.nama_kategori
      FROM produk
      LEFT JOIN kategori ON produk.kategori_id = kategori.id
      ORDER BY produk.is_active DESC, produk.nama_produk ASC
    `);

    return res.json(result.rows);
  } catch (error) {
    return next(translateProductError(error));
  }
};

exports.getProdukById = async (req, res, next) => {
  try {
    const result = await db.query(
      `
        SELECT produk.*, kategori.nama_kategori
        FROM produk
        LEFT JOIN kategori ON produk.kategori_id = kategori.id
        WHERE produk.id=$1
      `,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
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
          kode_produk,
          nama_produk,
          kategori_id,
          harga,
          stok,
          stok_minimum,
          is_active,
          active_from,
          active_until
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
    const currentResult = await db.query(
      "SELECT * FROM produk WHERE id=$1",
      [req.params.id],
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    const payload = normalizeProductPayload(req.body, currentResult.rows[0]);
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
        WHERE id=$10
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
      "DELETE FROM produk WHERE id=$1 RETURNING id",
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Produk tidak ditemukan" });
    }

    return res.json({ message: "Produk berhasil dihapus" });
  } catch (error) {
    if (error.code === "23503") {
      return next(createHttpError(409,
        "Produk tidak dapat dihapus karena masih mempunyai data terkait",
        { code: "PRODUCT_IN_USE", cause: error },
      ));
    }

    return next(translateProductError(error));
  }
};

module.exports.normalizeProductPayload = normalizeProductPayload;
module.exports.parseMonthDate = parseMonthDate;
