const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const { parseBooleanQuery } = require("../utils/pagination");

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
    const includeInactive = req.user?.role === "admin"
      && parseBooleanQuery(req.query.include_inactive, false);
    const includeDeleted = req.user?.role === "admin"
      && parseBooleanQuery(req.query.include_deleted, false);

    const result = await db.query(
      `
        SELECT
          k.*,
          COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL)::INTEGER AS jumlah_produk_aktif
        FROM kategori k
        LEFT JOIN produk p ON p.kategori_id=k.id AND p.is_active=TRUE
        WHERE ($1::BOOLEAN OR k.is_active=TRUE)
          AND ($2::BOOLEAN OR k.deleted_at IS NULL)
        GROUP BY k.id
        ORDER BY k.is_active DESC, k.nama_kategori ASC
      `,
      [includeInactive, includeDeleted],
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
        INSERT INTO kategori(nama_kategori, is_active)
        VALUES($1, TRUE)
        RETURNING id, nama_kategori, is_active, deleted_at, created_at, updated_at
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
        WHERE id=$2 AND deleted_at IS NULL
        RETURNING id, nama_kategori, is_active, deleted_at, created_at, updated_at
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
  const client = await db.connect();
  try {
    const id = parseId(req.params.id);
    await client.query("BEGIN");

    const categoryResult = await client.query(
      "SELECT id FROM kategori WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [id],
    );
    if (categoryResult.rows.length === 0) {
      throw createHttpError(404, "Kategori tidak ditemukan", {
        code: "CATEGORY_NOT_FOUND",
      });
    }

    const activeProducts = await client.query(
      `
        SELECT COUNT(*)::INTEGER AS total
        FROM produk
        WHERE kategori_id=$1 AND deleted_at IS NULL AND is_active=TRUE
      `,
      [id],
    );
    if (Number(activeProducts.rows[0].total) > 0) {
      throw createHttpError(
        409,
        "Kategori tidak dapat diarsipkan karena masih digunakan produk aktif",
        {
          code: "CATEGORY_HAS_ACTIVE_PRODUCTS",
          details: { active_products: Number(activeProducts.rows[0].total) },
        },
      );
    }

    const result = await client.query(
      `
        UPDATE kategori
        SET is_active=FALSE, deleted_at=NOW()
        WHERE id=$1
        RETURNING id, deleted_at
      `,
      [id],
    );
    await client.query("COMMIT");

    return res.json({
      message: "Kategori berhasil dinonaktifkan dan diarsipkan",
      kategori: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
};

exports.restoreKategori = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.query(
      `
        UPDATE kategori
        SET is_active=TRUE, deleted_at=NULL
        WHERE id=$1 AND deleted_at IS NOT NULL
        RETURNING *
      `,
      [id],
    );

    if (result.rows.length === 0) {
      throw createHttpError(404, "Kategori arsip tidak ditemukan", {
        code: "ARCHIVED_CATEGORY_NOT_FOUND",
      });
    }

    return res.json({
      message: "Kategori berhasil dipulihkan",
      kategori: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
};
