BEGIN;

DROP INDEX IF EXISTS idx_import_batch_imported_at;
DROP INDEX IF EXISTS idx_forecast_result_produk_period;
DROP INDEX IF EXISTS idx_forecast_result_latest;
DROP INDEX IF EXISTS idx_product_alias_nama_alias_lower;
DROP INDEX IF EXISTS idx_product_alias_produk_id;
DROP INDEX IF EXISTS idx_snapshot_persediaan_bulanan_produk_periode_desc;

DROP TABLE IF EXISTS import_batch;
DROP TABLE IF EXISTS forecast_result;
DROP TABLE IF EXISTS product_alias;

DROP TRIGGER IF EXISTS trg_snapshot_persediaan_bulanan_updated_at
  ON snapshot_persediaan_bulanan;
DROP TABLE IF EXISTS snapshot_persediaan_bulanan;
DROP FUNCTION IF EXISTS set_updated_at_timestamp();

COMMIT;
