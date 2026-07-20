const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");

function normalizeCategoryName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, "ID kategori tidak valid", {
      code: "INVALID_CATEGORY_ID",
    });
  }
  return id;
}

exports.getKategori = async (req, res, next) => {
  try {
    const result = await db.query(
      "SELECT * FROM kategori ORDER BY nama_kategori ASC",
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
};

exports.tambahKategori = async (req, res, next) => {
  try {
    const namaKategori = normalizeCategoryName(req.body?.nama_kategori);
    if (!namaKategori) {
      throw createHttpError(400, "Nama kategori harus diisi", {
        code: "CATEGORY_NAME_REQUIRED",
      });
    }

    const result = await db.query(
      `
        INSERT INTO kategori(nama_kategori)
        VALUES($1)
        RETURNING id, nama_kategori, created_at, updated_at
      `,
      [namaKategori],
    );

    return res.status(201).json({
      message: "Kategori berhasil ditambahkan",
      kategori: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateKategori = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const namaKategori = normalizeCategoryName(req.body?.nama_kategori);
    if (!namaKategori) {
      throw createHttpError(400, "Nama kategori harus diisi", {
        code: "CATEGORY_NAME_REQUIRED",
      });
    }

    const result = await db.query(
      `
        UPDATE kategori
        SET nama_kategori=$1
        WHERE id=$2
        RETURNING id, nama_kategori, created_at, updated_at
      `,
      [namaKategori, id],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Kategori tidak ditemukan", {
        code: "CATEGORY_NOT_FOUND",
      });
    }

    return res.json({
      message: "Kategori berhasil diperbarui",
      kategori: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteKategori = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(
      "DELETE FROM kategori WHERE id=$1 RETURNING id",
      [id],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Kategori tidak ditemukan", {
        code: "CATEGORY_NOT_FOUND",
      });
    }

    return res.json({
      message: "Kategori berhasil dihapus",
    });
  } catch (error) {
    return next(error);
  }
};
