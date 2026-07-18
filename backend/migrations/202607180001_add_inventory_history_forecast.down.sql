BEGIN;

DROP INDEX IF EXISTS idx_import_batch_imported_at;
DROP INDEX IF EXISTS idx_forecast_result_produk_period;
DROP INDEX IF EXISTS idx_forecast_result_latest;
DROP INDEX IF EXISTS idx_product_alias_nama_alias_lower;
DROP INDEX IF EXISTS idx_product_alias_produk_id;
DROP INDEX IF EXISTS idx_inventory_snapshot_monthly_produk_periode_desc;

DROP TABLE IF EXISTS import_batch;
DROP TABLE IF EXISTS forecast_result;
DROP TABLE IF EXISTS product_alias;

DROP TRIGGER IF EXISTS trg_inventory_snapshot_monthly_updated_at
  ON inventory_snapshot_monthly;
DROP TABLE IF EXISTS inventory_snapshot_monthly;
DROP FUNCTION IF EXISTS set_updated_at_timestamp();

COMMIT;
