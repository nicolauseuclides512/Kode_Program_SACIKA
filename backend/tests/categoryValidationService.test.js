const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertActiveCategory,
  getActiveCategory,
} = require("../services/categoryValidationService");

test("kategori aktif dikembalikan dan ID divalidasi", async () => {
  const db = {
    async query(sql, params) {
      assert.match(sql, /is_active=TRUE/);
      assert.deepEqual(params, [2]);
      return { rows: [{ id: 2, nama_kategori: "Minuman" }] };
    },
  };

  const category = await getActiveCategory(db, "2");
  assert.equal(category.nama_kategori, "Minuman");
});

test("kategori tidak aktif atau terhapus ditolak", async () => {
  const db = { async query() { return { rows: [] }; } };
  await assert.rejects(
    () => assertActiveCategory(db, 9),
    (error) => error.statusCode === 400 && error.code === "ACTIVE_CATEGORY_NOT_FOUND",
  );
});
