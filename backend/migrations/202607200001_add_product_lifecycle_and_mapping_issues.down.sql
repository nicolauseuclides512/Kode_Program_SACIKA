BEGIN;

DROP TRIGGER IF EXISTS trg_product_mapping_issue_updated_at
  ON product_mapping_issue;
DROP TABLE IF EXISTS product_mapping_issue;

UPDATE inventory_snapshot_monthly
SET status_data = 'missing',
    stok_akhir = NULL,
    updated_at = NOW()
WHERE status_data IN ('not_listed', 'not_active');

ALTER TABLE inventory_snapshot_monthly
  DROP CONSTRAINT IF EXISTS chk_inventory_snapshot_monthly_stok_status;

ALTER TABLE inventory_snapshot_monthly
  DROP CONSTRAINT IF EXISTS chk_inventory_snapshot_monthly_status_data;

ALTER TABLE inventory_snapshot_monthly
  ADD CONSTRAINT chk_inventory_snapshot_monthly_status_data
  CHECK (status_data IN ('observed', 'missing', 'corrected'));

ALTER TABLE inventory_snapshot_monthly
  ADD CONSTRAINT chk_inventory_snapshot_monthly_stok_status
  CHECK (
    (status_data = 'missing' AND stok_akhir IS NULL)
    OR (
      status_data IN ('observed', 'corrected')
      AND stok_akhir IS NOT NULL
      AND stok_akhir >= 0
    )
  );

DROP INDEX IF EXISTS idx_produk_active_lifecycle;

ALTER TABLE produk
  DROP CONSTRAINT IF EXISTS chk_produk_inactive_requires_end,
  DROP CONSTRAINT IF EXISTS chk_produk_active_period_order,
  DROP CONSTRAINT IF EXISTS chk_produk_active_until_awal_bulan,
  DROP CONSTRAINT IF EXISTS chk_produk_active_from_awal_bulan,
  DROP COLUMN IF EXISTS active_until,
  DROP COLUMN IF EXISTS active_from,
  DROP COLUMN IF EXISTS is_active;

COMMIT;
