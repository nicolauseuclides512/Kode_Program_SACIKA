const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeProductPayload,
  parseMonthDate,
} = require("../controllers/produkController");

test("product payload accepts active lifecycle fields", () => {
  const payload = normalizeProductPayload({
    nama_produk: "Aqua Botol",
    kategori_id: 1,
    harga: 3000,
    stok: 0,
    stok_minimum: 0,
    is_active: false,
    active_from: "2024-01",
    active_until: "2025-12",
  });

  assert.equal(payload.stok_minimum, 0);
  assert.equal(payload.is_active, false);
  assert.equal(payload.active_from, "2024-01-01");
  assert.equal(payload.active_until, "2025-12-01");
});

test("product payload rejects reversed active period", () => {
  assert.throws(() => normalizeProductPayload({
    nama_produk: "Produk",
    kategori_id: 1,
    harga: 1000,
    active_from: "2025-02",
    active_until: "2025-01",
  }), /active_until/);
});

test("parseMonthDate rejects an invalid month", () => {
  assert.throws(() => parseMonthDate("2025-13", "active_from"), /format/);
});
