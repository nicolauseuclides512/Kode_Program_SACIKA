BEGIN;

ALTER TABLE produk
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS active_from DATE,
  ADD COLUMN IF NOT EXISTS active_until DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_produk_active_from_awal_bulan'
  ) THEN
    ALTER TABLE produk
      ADD CONSTRAINT chk_produk_active_from_awal_bulan
      CHECK (
        active_from IS NULL
        OR active_from = DATE_TRUNC('month', active_from)::DATE
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_produk_active_until_awal_bulan'
  ) THEN
    ALTER TABLE produk
      ADD CONSTRAINT chk_produk_active_until_awal_bulan
      CHECK (
        active_until IS NULL
        OR active_until = DATE_TRUNC('month', active_until)::DATE
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_produk_active_period_order'
  ) THEN
    ALTER TABLE produk
      ADD CONSTRAINT chk_produk_active_period_order
      CHECK (
        active_from IS NULL
        OR active_until IS NULL
        OR active_until >= active_from
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_produk_inactive_requires_end'
  ) THEN
    ALTER TABLE produk
      ADD CONSTRAINT chk_produk_inactive_requires_end
      CHECK (is_active OR active_until IS NOT NULL);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_produk_active_lifecycle
  ON produk (is_active, active_from, active_until);

ALTER TABLE inventory_snapshot_monthly
  DROP CONSTRAINT IF EXISTS chk_inventory_snapshot_monthly_stok_status;

ALTER TABLE inventory_snapshot_monthly
  DROP CONSTRAINT IF EXISTS chk_inventory_snapshot_monthly_status_data;

ALTER TABLE inventory_snapshot_monthly
  ADD CONSTRAINT chk_inventory_snapshot_monthly_status_data
  CHECK (
    status_data IN (
      'observed',
      'corrected',
      'missing',
      'not_listed',
      'not_active'
    )
  );

ALTER TABLE inventory_snapshot_monthly
  ADD CONSTRAINT chk_inventory_snapshot_monthly_stok_status
  CHECK (
    (
      status_data IN ('missing', 'not_listed', 'not_active')
      AND stok_akhir IS NULL
    )
    OR (
      status_data IN ('observed', 'corrected')
      AND stok_akhir IS NOT NULL
      AND stok_akhir >= 0
    )
  );

CREATE TABLE IF NOT EXISTS product_mapping_issue (
  id BIGSERIAL PRIMARY KEY,
  sumber_file TEXT NOT NULL,
  sheet_name TEXT,
  row_number INTEGER,
  periode DATE,
  nama_barang_sumber TEXT,
  nama_normalisasi TEXT,
  issue_type TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_product_id INTEGER REFERENCES produk(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_product_mapping_issue_source_not_empty
    CHECK (BTRIM(sumber_file) <> ''),
  CONSTRAINT chk_product_mapping_issue_row_positive
    CHECK (row_number IS NULL OR row_number > 0),
  CONSTRAINT chk_product_mapping_issue_period_month_start
    CHECK (
      periode IS NULL
      OR periode = DATE_TRUNC('month', periode)::DATE
    ),
  CONSTRAINT chk_product_mapping_issue_type
    CHECK (
      issue_type IN (
        'unresolved',
        'collision',
        'invalid_name',
        'invalid_jml',
        'lifecycle_conflict'
      )
    ),
  CONSTRAINT chk_product_mapping_issue_status
    CHECK (status IN ('open', 'resolved', 'ignored'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_mapping_issue_source
  ON product_mapping_issue (
    sumber_file,
    COALESCE(sheet_name, ''),
    COALESCE(row_number, 0),
    COALESCE(periode, DATE '1900-01-01'),
    issue_type,
    COALESCE(nama_normalisasi, '')
  );

CREATE INDEX IF NOT EXISTS idx_product_mapping_issue_open
  ON product_mapping_issue (status, issue_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_mapping_issue_normalized
  ON product_mapping_issue (nama_normalisasi)
  WHERE nama_normalisasi IS NOT NULL;

DROP TRIGGER IF EXISTS trg_product_mapping_issue_updated_at
  ON product_mapping_issue;

CREATE TRIGGER trg_product_mapping_issue_updated_at
BEFORE UPDATE ON product_mapping_issue
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

COMMIT;
