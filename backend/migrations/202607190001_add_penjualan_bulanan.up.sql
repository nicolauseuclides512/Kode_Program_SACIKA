BEGIN;

CREATE TABLE IF NOT EXISTS penjualan_bulanan (
  id BIGSERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
  periode DATE NOT NULL,
  total_penjualan NUMERIC(14, 2) NOT NULL DEFAULT 0,
  CONSTRAINT uq_penjualan_bulanan_produk_periode
    UNIQUE (produk_id, periode),
  CONSTRAINT chk_penjualan_bulanan_periode_awal_bulan
    CHECK (periode = DATE_TRUNC('month', periode)::DATE),
  CONSTRAINT chk_penjualan_bulanan_total_nonnegative
    CHECK (total_penjualan >= 0)
);

CREATE INDEX IF NOT EXISTS idx_penjualan_bulanan_produk_periode_desc
  ON penjualan_bulanan (produk_id, periode DESC);

COMMIT;
