BEGIN;

DROP INDEX IF EXISTS idx_kategori_deleted_at;
DROP INDEX IF EXISTS idx_produk_deleted_at;
DROP INDEX IF EXISTS idx_produk_active_not_deleted;
DROP INDEX IF EXISTS idx_kategori_active_not_deleted;

DROP INDEX IF EXISTS uq_produk_kode_lower_active;
DROP INDEX IF EXISTS uq_produk_nama_lower_active;
DROP INDEX IF EXISTS uq_kategori_nama_lower_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kategori_nama_lower
  ON kategori (LOWER(BTRIM(nama_kategori)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_nama_lower
  ON produk (LOWER(BTRIM(nama_produk)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_kode_lower
  ON produk (LOWER(BTRIM(kode_produk)))
  WHERE kode_produk IS NOT NULL;

ALTER TABLE produk DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE kategori
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS is_active;

COMMIT;
