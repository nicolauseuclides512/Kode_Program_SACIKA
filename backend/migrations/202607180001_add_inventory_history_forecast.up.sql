BEGIN;

CREATE TABLE IF NOT EXISTS snapshot_persediaan_bulanan (
  id BIGSERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
  periode DATE NOT NULL,
  stok_akhir NUMERIC(14, 2) NOT NULL,
  harga_rata_rata NUMERIC(14, 2),
  nilai_aset NUMERIC(18, 2),
  nama_barang_sumber TEXT,
  sumber_file TEXT,
  status_data TEXT NOT NULL DEFAULT 'observed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_snapshot_persediaan_bulanan_produk_periode
    UNIQUE (produk_id, periode),
  CONSTRAINT chk_snapshot_persediaan_bulanan_periode_awal_bulan
    CHECK (periode = DATE_TRUNC('month', periode)::DATE),
  CONSTRAINT chk_snapshot_persediaan_bulanan_stok_nonnegative
    CHECK (stok_akhir >= 0),
  CONSTRAINT chk_snapshot_persediaan_bulanan_harga_nonnegative
    CHECK (harga_rata_rata IS NULL OR harga_rata_rata >= 0),
  CONSTRAINT chk_snapshot_persediaan_bulanan_nilai_aset_nonnegative
    CHECK (nilai_aset IS NULL OR nilai_aset >= 0),
  CONSTRAINT chk_snapshot_persediaan_bulanan_status_data
    CHECK (status_data IN ('observed', 'missing', 'corrected'))
);

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_persediaan_bulanan_updated_at
BEFORE UPDATE ON snapshot_persediaan_bulanan
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE TABLE IF NOT EXISTS product_alias (
  id BIGSERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE CASCADE,
  nama_alias TEXT NOT NULL,
  nama_normalisasi TEXT NOT NULL,
  CONSTRAINT uq_product_alias_nama_normalisasi
    UNIQUE (nama_normalisasi),
  CONSTRAINT chk_product_alias_nama_alias_not_empty
    CHECK (BTRIM(nama_alias) <> ''),
  CONSTRAINT chk_product_alias_nama_normalisasi_format
    CHECK (
      nama_normalisasi = LOWER(BTRIM(nama_normalisasi))
      AND nama_normalisasi <> ''
    )
);

CREATE TABLE IF NOT EXISTS forecast_result (
  id BIGSERIAL PRIMARY KEY,
  produk_id INTEGER NOT NULL REFERENCES produk(id) ON DELETE RESTRICT,
  target TEXT NOT NULL,
  model_used TEXT NOT NULL,
  data_cutoff DATE NOT NULL,
  forecast_period DATE NOT NULL,
  forecast_value NUMERIC(14, 2) NOT NULL,
  mae NUMERIC(14, 4),
  rmse NUMERIC(14, 4),
  wape NUMERIC(14, 4),
  observation_count INTEGER NOT NULL,
  warning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_forecast_result_target_not_empty
    CHECK (BTRIM(target) <> ''),
  CONSTRAINT chk_forecast_result_model_used_not_empty
    CHECK (BTRIM(model_used) <> ''),
  CONSTRAINT chk_forecast_result_forecast_value_nonnegative
    CHECK (forecast_value >= 0),
  CONSTRAINT chk_forecast_result_mae_nonnegative
    CHECK (mae IS NULL OR mae >= 0),
  CONSTRAINT chk_forecast_result_rmse_nonnegative
    CHECK (rmse IS NULL OR rmse >= 0),
  CONSTRAINT chk_forecast_result_wape_nonnegative
    CHECK (wape IS NULL OR wape >= 0),
  CONSTRAINT chk_forecast_result_observation_count_nonnegative
    CHECK (observation_count >= 0)
);

CREATE TABLE IF NOT EXISTS import_batch (
  id BIGSERIAL PRIMARY KEY,
  nama_file TEXT NOT NULL,
  jumlah_baris INTEGER NOT NULL DEFAULT 0,
  jumlah_berhasil INTEGER NOT NULL DEFAULT 0,
  jumlah_gagal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  detail_error JSONB,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_import_batch_nama_file_not_empty
    CHECK (BTRIM(nama_file) <> ''),
  CONSTRAINT chk_import_batch_counts_nonnegative
    CHECK (
      jumlah_baris >= 0
      AND jumlah_berhasil >= 0
      AND jumlah_gagal >= 0
    ),
  CONSTRAINT chk_import_batch_counts_within_total
    CHECK (jumlah_berhasil + jumlah_gagal <= jumlah_baris),
  CONSTRAINT chk_import_batch_status
    CHECK (status IN ('pending', 'processing', 'success', 'partial', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_snapshot_persediaan_bulanan_produk_periode_desc
  ON snapshot_persediaan_bulanan (produk_id, periode DESC);

CREATE INDEX IF NOT EXISTS idx_product_alias_produk_id
  ON product_alias (produk_id);

CREATE INDEX IF NOT EXISTS idx_product_alias_nama_alias_lower
  ON product_alias (LOWER(nama_alias));

CREATE INDEX IF NOT EXISTS idx_forecast_result_latest
  ON forecast_result (produk_id, target, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_forecast_result_produk_period
  ON forecast_result (produk_id, target, forecast_period DESC);

CREATE INDEX IF NOT EXISTS idx_import_batch_imported_at
  ON import_batch (imported_at DESC);

COMMIT;
