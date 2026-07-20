const db = require("../config/database");
const { createHttpError } = require("../utils/httpError");
const { translateDatabaseError } = require("../utils/databaseErrors");
const { normalizeText, parseIntegerId } = require("../utils/validation");
const { parseBooleanQuery } = require("../utils/pagination");

function translateCategoryError(error) {
  return translateDatabaseError(error, {
    duplicateMessage: "Nama kategori sudah digunakan",
    duplicateCode: "CATEGORY_CONFLICT",
    referenceMessage: "Kategori tidak dapat diubah karena masih digunakan oleh produk",
    referenceCode: "CATEGORY_STILL_IN_USE",
    constraintMessage: "Data kategori tidak memenuhi aturan sistem",
    constraintCode: "INVALID_CATEGORY_DATA",
  });
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
    return next(translateCategoryError(error));
  }
};

exports.tambahKategori = async (req, res, next) => {
  try {
    const namaKategori = normalizeText(req.body?.nama_kategori, "nama_kategori", { maxLength: 150 });

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
    return next(translateCategoryError(error));
  }
};

exports.updateKategori = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "kategori_id");
    const namaKategori = normalizeText(req.body?.nama_kategori, "nama_kategori", { maxLength: 150 });

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
    return next(translateCategoryError(error));
  }
};

exports.deleteKategori = async (req, res, next) => {
  const client = await db.connect();
  try {
    const id = parseIntegerId(req.params.id, "kategori_id");
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
        WHERE kategori_id=$1 AND deleted_at IS NULL
      `,
      [id],
    );
    if (Number(activeProducts.rows[0].total) > 0) {
      throw createHttpError(
        409,
        "Kategori tidak dapat diarsipkan karena masih digunakan oleh produk",
        {
          code: "CATEGORY_STILL_IN_USE",
          details: { products_in_use: Number(activeProducts.rows[0].total) },
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
    return next(translateCategoryError(error));
  } finally {
    client.release();
  }
};

exports.restoreKategori = async (req, res, next) => {
  try {
    const id = parseIntegerId(req.params.id, "kategori_id");
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
    return next(translateCategoryError(error));
  }
};
