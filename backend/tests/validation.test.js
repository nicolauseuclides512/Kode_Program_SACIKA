const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeText,
  parseIntegerId,
  parseIsoDate,
  parseNonNegativeDecimal,
  parsePositiveDecimal,
} = require("../utils/validation");
const { normalizeProductPayload } = require("../controllers/produkController");

function assertHttpError(callback, expectedCode) {
  assert.throws(callback, (error) => {
    assert.equal(error.statusCode, 400);
    if (expectedCode) assert.equal(error.code, expectedCode);
    return true;
  });
}

test("stok_minimum bernilai nol tetap dipertahankan", () => {
  const payload = normalizeProductPayload({
    nama_produk: "Produk Nol",
    kategori_id: 1,
    harga: 0,
    stok: 0,
    stok_minimum: 0,
  });

  assert.equal(payload.harga, 0);
  assert.equal(payload.stok, 0);
  assert.equal(payload.stok_minimum, 0);
});

test("nilai produk negatif, kosong, terlalu besar, dan lebih dari dua desimal ditolak", () => {
  assertHttpError(() => parseNonNegativeDecimal(-1, "stok"), "INVALID_STOK");
  assertHttpError(() => parseNonNegativeDecimal("", "stok"), "INVALID_STOK");
  assertHttpError(
    () => parseNonNegativeDecimal("1.234", "stok"),
    "INVALID_STOK_SCALE",
  );
  assertHttpError(
    () => parseNonNegativeDecimal("1000000000000", "stok"),
    "STOK_OUT_OF_RANGE",
  );
});

test("jumlah dan harga transaksi harus positif", () => {
  assert.equal(parsePositiveDecimal("10.25", "jumlah"), 10.25);
  assertHttpError(() => parsePositiveDecimal(0, "jumlah"), "INVALID_JUMLAH");
  assertHttpError(() => parsePositiveDecimal(-1, "harga"), "INVALID_HARGA");
});

test("ID, tanggal, dan teks divalidasi secara ketat", () => {
  assert.equal(parseIntegerId("12", "kategori_id"), 12);
  assert.equal(parseIsoDate("2026-07-20", "tanggal"), "2026-07-20");
  assert.equal(normalizeText("  Minuman  ", "nama"), "Minuman");

  assertHttpError(() => parseIntegerId("1.5", "kategori_id"), "INVALID_KATEGORI_ID");
  assertHttpError(() => parseIsoDate("2026-02-30", "tanggal"), "INVALID_TANGGAL");
  assertHttpError(() => normalizeText("   ", "nama"), "NAMA_REQUIRED");
});
