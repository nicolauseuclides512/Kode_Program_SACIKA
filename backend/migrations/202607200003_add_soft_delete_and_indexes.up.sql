BEGIN;

ALTER TABLE kategori
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE produk
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DROP INDEX IF EXISTS uq_kategori_nama_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_kategori_nama_lower_active
  ON kategori (LOWER(BTRIM(nama_kategori)))
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS uq_produk_nama_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_nama_lower_active
  ON produk (LOWER(BTRIM(nama_produk)))
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS uq_produk_kode_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_produk_kode_lower_active
  ON produk (LOWER(BTRIM(kode_produk)))
  WHERE kode_produk IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_kategori_active_not_deleted
  ON kategori (is_active, nama_kategori)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_produk_active_not_deleted
  ON produk (is_active, nama_produk)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_produk_deleted_at
  ON produk (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kategori_deleted_at
  ON kategori (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMIT;
