const { createHttpError } = require("../utils/httpError");
const { parseIntegerId } = require("../utils/validation");

async function getActiveCategory(db, categoryId, options = {}) {
  const id = parseIntegerId(categoryId, "kategori_id");
  const lockClause = options.forUpdate ? "FOR UPDATE" : "";
  const result = await db.query(
    `
      SELECT id, nama_kategori, is_active, deleted_at
      FROM kategori
      WHERE id=$1
        AND is_active=TRUE
        AND deleted_at IS NULL
      ${lockClause}
    `,
    [id],
  );

  return result.rows[0] || null;
}

async function assertActiveCategory(db, categoryId, options = {}) {
  const category = await getActiveCategory(db, categoryId, options);

  if (!category) {
    throw createHttpError(400, "Kategori aktif tidak ditemukan", {
      code: "ACTIVE_CATEGORY_NOT_FOUND",
    });
  }

  return category;
}

module.exports = {
  assertActiveCategory,
  getActiveCategory,
};
